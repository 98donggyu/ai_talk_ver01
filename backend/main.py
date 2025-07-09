import os
import uuid
import json
import base64
import tempfile
import asyncio
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv

import openai
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from pinecone import Pinecone, ServerlessSpec

# --- 1. 초기 설정 (환경 변수, DB, Pinecone, FastAPI 앱) ---

load_dotenv()

# prompts.json 파일을 읽어서 파이썬 딕셔너리로 변환
try:
    with open('prompts.json', 'r', encoding='utf-8') as f:
        PROMPTS_CONFIG = json.load(f)['main_chat_prompt']
    print("✅ prompts.json 파일을 성공적으로 불러왔습니다.")
except FileNotFoundError:
    print("❌ prompts.json 파일을 찾을 수 없습니다. main.py와 같은 위치에 있는지 확인해주세요.")
    exit()


DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_NAME = "ai_talk_db"

def init_db():
    """서버 시작 시 데이터베이스와 테이블을 확인하고 생성합니다."""
    try:
        server_engine = create_engine(f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}?charset=utf8mb4")
        with server_engine.connect() as connection:
            connection.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        
        db_engine = create_engine(f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}?charset=utf8mb4")
        with db_engine.connect() as connection:
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL,
                user_message TEXT NOT NULL, ai_message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );"""))
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS summaries (
                id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(255) NOT NULL,
                summary_text TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
            );"""))
        print("✅ MySQL 데이터베이스 및 테이블이 성공적으로 준비되었습니다.")
        return db_engine
    except Exception as e:
        print(f"❌ 데이터베이스 설정 중 오류 발생: {e}")
        return None

engine = init_db()
if engine is None:
    exit("데이터베이스 연결 실패로 서버를 시작할 수 없습니다.")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

index_name = "long-term-memory"
if index_name not in pc.list_indexes().names():
    pc.create_index(name=index_name, dimension=1536, metric="cosine", spec=ServerlessSpec(cloud="aws", region="us-east-1"))
index = pc.Index(index_name)
print(f"✅ Pinecone '{index_name}' 인덱스에 성공적으로 연결되었습니다.")


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    async def send_json(self, data: dict, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(json.dumps(data))

manager = ConnectionManager()
session_conversations = {}


# --- 2. 데이터 처리 핵심 함수들 ---

async def get_embedding(text):
    response = await asyncio.to_thread(client.embeddings.create, input=text, model="text-embedding-3-small")
    return response.data[0].embedding

async def save_conversation_to_mysql(user_id: str, user_message: str, ai_message: str):
    db = SessionLocal()
    try:
        query = text("INSERT INTO conversations (user_id, user_message, ai_message) VALUES (:user_id, :user_message, :ai_message)")
        db.execute(query, {"user_id": user_id, "user_message": user_message, "ai_message": ai_message})
        db.commit()
    finally:
        db.close()

async def create_memory_for_pinecone(user_id: str, current_session_log: list):
    """현재 세션의 대화 기록으로 Pinecone에 저장할 기억(요약 또는 원문)을 생성합니다."""
    print(f"🧠 [{user_id}] 님의 세션 기억 생성을 시작합니다.")
    
    if not current_session_log:
        print("-> 이번 세션에 대화 내용이 없어, 기억을 생성하지 않습니다.")
        return

    is_short_conversation = len(current_session_log) < 4
    memory_text, memory_type = "", ""

    if is_short_conversation:
        print("-> 짧은 대화로 판단, 대화 원문을 'utterance' 타입으로 저장합니다.")
        memory_text = "\n".join(current_session_log)
        memory_type = 'utterance'
    else:
        print("-> 긴 대화로 판단, 핵심 요약을 'summary' 타입으로 생성합니다.")
        conversation_history = "\n".join(current_session_log)
        summary_prompt = "다음 대화 내용에서 사용자의 주요 관심사, 감정, 중요한 정보 등을 1~2 문장의 간결한 기억으로 생성해줘. 규칙: 지명, 인명 등 모든 고유명사는 반드시 포함시켜야 해.\n\n--- 대화 내용 ---\n{conversation_history}\n-----------------\n\n핵심 기억:"
        summary_response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4o",
            messages=[{"role": "user", "content": summary_prompt.format(conversation_history=conversation_history)}],
            max_tokens=200,
            temperature=0.3
        )
        memory_text = summary_response.choices[0].message.content
        memory_type = 'summary'

    print(f"📝 생성된 기억 (타입: {memory_type}): {memory_text}")
    embedding = await get_embedding(memory_text)
    
    vector_to_upsert = {
        'id': str(uuid.uuid4()),
        'values': embedding,
        'metadata': {
            'user_id': user_id,
            'text': memory_text,
            'timestamp': int(time.time()),
            'memory_type': memory_type
        }
    }
    
    await asyncio.to_thread(index.upsert, vectors=[vector_to_upsert])
    print(f"✅ [{user_id}] 님의 새로운 세션 기억이 Pinecone에 저장되었습니다.")

async def create_hourly_summary_report(user_id: str):
    """1시간 주기로 새로운 대화 내용을 종합하여 '시간별 리포트'를 생성합니다."""
    print(f"🗓️ [{user_id}] 님의 시간별 리포트 생성 여부를 확인합니다.")
    db = SessionLocal()
    try:
        last_summary_query = text("SELECT created_at FROM summaries WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 1")
        last_summary_time = db.execute(last_summary_query, {"user_id": user_id}).scalar_one_or_none()

        one_hour_ago = datetime.now() - timedelta(hours=1)
        if last_summary_time and last_summary_time > one_hour_ago:
            print("-> 마지막 리포트 생성 후 1시간이 지나지 않아, 생성을 건너뜁니다.")
            return

        start_time = last_summary_time or datetime.min
        new_conv_query = text("SELECT user_message, ai_message FROM conversations WHERE user_id = :user_id AND created_at > :start_time")
        new_conversations = db.execute(new_conv_query, {"user_id": user_id, "start_time": start_time}).fetchall()

        if not new_conversations:
            print("-> 리포트에 추가할 새로운 대화 내용이 없습니다.")
            return

        print(f"-> 새로운 대화 {len(new_conversations)}건을 바탕으로 시간별 리포트를 생성합니다.")
        conversation_history = "\n".join([f"사용자: {row[0]}\nAI: {row[1]}" for row in new_conversations])
        report_prompt = f"다음은 사용자의 최근 대화 내용입니다. 이 내용을 바탕으로 사용자의 상태와 주요 대화 내용을 요약하는 '시간별 리포트'를 작성해주세요.\n\n--- 대화 내용 ---\n{conversation_history}\n-----------------\n\n시간별 리포트:"
        
        report_response = await asyncio.to_thread(client.chat.completions.create, model="gpt-4o", messages=[{"role": "user", "content": report_prompt}])
        report_text = report_response.choices[0].message.content
        
        summary_save_query = text("INSERT INTO summaries (user_id, summary_text) VALUES (:user_id, :summary_text)")
        db.execute(summary_save_query, {"user_id": user_id, "summary_text": report_text})
        db.commit()
        print(f"✅ [{user_id}] 님의 시간별 리포트가 MySQL summaries 테이블에 저장되었습니다.")
    finally:
        db.close()

async def search_memories(user_id: str, query_message: str, top_k=5):
    """Pinecone에서 관련 기억을 검색하고, 최신 기억에 가중치를 부여해 재정렬합니다."""
    query_embedding = await get_embedding(query_message)
    results = await asyncio.to_thread(index.query, vector=query_embedding, top_k=top_k, filter={'user_id': user_id}, include_metadata=True)
    
    now = int(time.time())
    ranked_memories = []
    
    for match in results['matches']:
        similarity_score = match['score']
        metadata = match.get('metadata', {})
        timestamp = metadata.get('timestamp', now)
        time_decay_factor = 30 * 24 * 60 * 60
        recency_score = max(0, (timestamp - (now - time_decay_factor)) / time_decay_factor)
        final_score = (similarity_score * 0.7) + (recency_score * 0.3)
        ranked_memories.append({'text': metadata.get('text', ''), 'score': final_score})
        
    ranked_memories.sort(key=lambda x: x['score'], reverse=True)
    top_memories = [item['text'] for item in ranked_memories[:3]]
    
    print(f"🔍 [{user_id}] 님의 과거 핵심 기억 {len(top_memories)}개를 재정렬하여 검색했습니다.")
    return "\n".join(top_memories)

async def process_audio_and_get_response(user_id: str, audio_base64: str):
    """오디오 처리, 기억 검색, AI 응답 생성, DB 저장을 총괄하며 JSON 프롬프트를 사용합니다."""
    audio_data = base64.b64decode(audio_base64)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(audio_data); temp_audio_path = temp_audio.name
    try:
        with open(temp_audio_path, "rb") as audio_file:
            transcript_response = await asyncio.to_thread(client.audio.transcriptions.create, model="whisper-1", file=audio_file, language="ko")
        user_message = transcript_response.text
        if not user_message.strip() or "시청해주셔서 감사합니다" in user_message:
            return None, "음, 잘 알아듣지 못했어요. 혹시 다시 한번 말씀해주시겠어요?"
        
        relevant_memories = await search_memories(user_id, user_message)
        
        # prompts.json 내용을 조합하여 최종 프롬프트를 동적으로 생성
        system_message = "\n".join(PROMPTS_CONFIG['system_message_base'])
        examples_text = "\n\n".join([f"상황: {ex['situation']}\n사용자 입력: {ex['user_input']}\nAI 응답: {ex['ai_response']}\n" for ex in PROMPTS_CONFIG['examples']])
        
        final_prompt = f"""
# 페르소나
{system_message}

# 핵심 대화 규칙
{"\n".join(PROMPTS_CONFIG['core_conversation_rules'])}

# 응답 가이드라인
{"\n".join(PROMPTS_CONFIG['guidelines_and_reactions'])}

# 절대 금지사항
{"\n".join(PROMPTS_CONFIG['strict_prohibitions'])}

# 성공적인 대화 예시
{examples_text}

---
이제 실제 대화를 시작합니다.

--- 과거 대화 핵심 기억 ---
{relevant_memories if relevant_memories else "이전 대화 기록이 없습니다."}
--------------------

현재 사용자 메시지: "{user_message}"
AI 답변:
"""
        
        chat_response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "당신은 주어진 규칙과 페르소나를 완벽하게 따르는 AI 어시스턴트입니다."},
                {"role": "user", "content": final_prompt}
            ],
            max_tokens=150,
            temperature=0.7
        )
        ai_response = chat_response.choices[0].message.content
        
        await save_conversation_to_mysql(user_id, user_message, ai_response)
        
        if user_id in session_conversations:
            session_conversations[user_id].append(f"사용자: {user_message}")
            session_conversations[user_id].append(f"AI: {ai_response}")
            
        return user_message, ai_response
    finally:
        os.unlink(temp_audio_path)


# --- 3. 웹소켓 엔드포인트 및 세션 관리 ---

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket, user_id: str = Query(...)):
    """웹소켓 연결 및 세션의 시작과 끝을 관리합니다."""
    await manager.connect(websocket, user_id)
    session_conversations[user_id] = []
    print(f"클라이언트 [{user_id}] 연결됨. 새 세션을 시작합니다.")
    
    start_question = "안녕하세요! 오늘은 어떤 하루를 보내고 계신가요?"
    await manager.send_json({"type": "ai_message", "content": start_question}, user_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            if message_data.get("type") == "audio_data":
                user_message, ai_response = await process_audio_and_get_response(user_id, message_data["audio"])
                if user_message:
                    await manager.send_json({"type": "user_message", "content": user_message}, user_id)
                await manager.send_json({"type": "ai_message", "content": ai_response}, user_id)
            
    except WebSocketDisconnect:
        print(f"클라이언트 [{user_id}] 연결이 끊어졌습니다.")
    finally:
        # 세션 종료 시 기억 생성 및 리포트 생성 시도
        if user_id in session_conversations:
            current_session_log = session_conversations.pop(user_id)
            # 두 작업을 동시에 비동기적으로 실행
            await asyncio.gather(
                create_memory_for_pinecone(user_id, current_session_log),
                create_hourly_summary_report(user_id)
            )
            print(f"세션 데이터 처리 및 정리 완료: {user_id}")

        manager.disconnect(user_id)
        print(f"[{user_id}] 클라이언트와의 모든 처리가 완료되었습니다.")

@app.get("/")
async def root():
    return {"message": "AI Talk Backend is Running"}