import os
import uuid
import json
import base64
import tempfile
import asyncio
import random
from dotenv import load_dotenv

import openai
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from pinecone import Pinecone, ServerlessSpec

# .env 파일에서 환경 변수 불러오기
load_dotenv()

# --- [추가] 디버깅용: .env 파일 값 확인 ---
print("--- .env 파일에서 불러온 환경 변수 값 ---")
print(f"DB_HOST: {os.getenv('DB_HOST')}")
print(f"DB_USER: {os.getenv('DB_USER')}")
db_pass = os.getenv('DB_PASSWORD')
# 비밀번호는 보안상 전체를 출력하지 않고, 로드 여부만 확인합니다.
print(f"DB_PASSWORD 로드 여부: {'성공' if db_pass else '실패 (None)'}")
print("------------------------------------")

# --- [수정] DB 자동 생성 및 연결 설정 ---
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_NAME = "ai_talk_db"

def init_db():
    """
    서버 시작 시 데이터베이스와 테이블을 확인하고 생성하는 함수
    """
    try:
        # --- [수정] 1. 데이터베이스 없이 서버에 먼저 연결 ---
        # URL에 직접 매개변수를 포함시킵니다.
        server_connection_url = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}?charset=utf8mb4"
        server_engine = create_engine(server_connection_url)

        with server_engine.connect() as connection:
            print(f"'{DB_NAME}' 데이터베이스 확인 및 생성 시도...")
            connection.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
            print(f"-> '{DB_NAME}' 데이터베이스 준비 완료.")
        
        # --- [수정] 2. 생성된 데이터베이스로 연결 엔진 재생성 ---
        # URL에 직접 매개변수를 포함시킵니다.
        db_connection_url = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}?charset=utf8mb4"
        db_engine = create_engine(db_connection_url)

        with db_engine.connect() as connection:
            print("'conversations'와 'summaries' 테이블 확인 및 생성 시도...")
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                user_message TEXT NOT NULL,
                ai_message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """))
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS summaries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                summary_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
            );
            """))
            print("-> 테이블 준비 완료.")
        
        print("✅ MySQL 데이터베이스 및 테이블이 성공적으로 준비되었습니다.")
        return db_engine
        
    except Exception as e:
        print(f"❌ 데이터베이스 설정 중 오류 발생: {e}")
        return None

# FastAPI 앱 시작 전에 DB 초기화 실행
engine = init_db()
if engine is None:
    exit("데이터베이스 연결 실패로 서버를 시작할 수 없습니다.")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# --- 1. 초기 설정 ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --- Pinecone 클라이언트 초기화 ---
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index_name = "long-term-memory"
if index_name not in pc.list_indexes().names():
    print(f"'{index_name}' 인덱스를 새로 생성합니다...")
    pc.create_index(
        name=index_name,
        dimension=1536,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
index = pc.Index(index_name)
print(f"✅ Pinecone '{index_name}' 인덱스에 성공적으로 연결되었습니다.")


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    async def send_json(self, data: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(data))

manager = ConnectionManager()

# --- [수정] 2. 데이터 처리 핵심 함수들 ---

async def get_embedding(text):
    response = await asyncio.to_thread(client.embeddings.create, input=text, model="text-embedding-3-small")
    return response.data[0].embedding

async def save_conversation_to_mysql(user_id: str, user_message: str, ai_message: str):
    """모든 대화를 MySQL에 저장하는 함수"""
    db = SessionLocal()
    try:
        query = text("""
            INSERT INTO conversations (user_id, user_message, ai_message)
            VALUES (:user_id, :user_message, :ai_message)
        """)
        db.execute(query, {"user_id": user_id, "user_message": user_message, "ai_message": ai_message})
        db.commit()
        print(f"✅ [{user_id}] 님의 대화가 MySQL에 저장되었습니다.")
    finally:
        db.close()

async def summarize_and_save_memory(user_id: str):
    """최근 대화를 요약하고, 핵심 내용을 Vector DB에 저장하는 함수"""
    print(f"🔍 [{user_id}] 님의 대화 요약 및 기억 저장을 시작합니다.")
    db = SessionLocal()
    try:
        query = text("SELECT user_message, ai_message FROM conversations WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 10")
        result = db.execute(query, {"user_id": user_id})
        conversations = result.fetchall()

        if not conversations:
            return

        conversation_history = "\n".join([f"사용자: {row[0]}\nAI: {row[1]}" for row in conversations])
        summary_prompt = f"다음 대화 내용에서 사용자의 주요 관심사, 감정, 중요한 정보 등을 1~2문장의 핵심 보고서로 요약해줘.\n\n--- 대화 내용 ---\n{conversation_history}\n-----------------\n\n핵심 요약 보고서:"
        
        summary_response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4o",
            messages=[{"role": "user", "content": summary_prompt}],
            max_tokens=200,
            temperature=0.3
        )
        summary_text = summary_response.choices[0].message.content
        print(f"📝 [{user_id}] 님 대화 요약 완료: {summary_text}")
        
        summary_save_query = text("INSERT INTO summaries (user_id, summary_text) VALUES (:user_id, :summary_text)")
        db.execute(summary_save_query, {"user_id": user_id, "summary_text": summary_text})
        db.commit()

        embedding = await get_embedding(summary_text)
        memory_id = str(uuid.uuid4())
        vector_to_upsert = {'id': memory_id, 'values': embedding, 'metadata': {'user_id': user_id, 'text': summary_text}}
        await asyncio.to_thread(index.upsert, vectors=[vector_to_upsert])
        print(f"🧠 [{user_id}] 님의 핵심 기억이 Pinecone에 저장되었습니다.")
    finally:
        db.close()

async def search_memories(user_id: str, query_message: str, top_k=3):
    """Pinecone에서 핵심 기억(요약본)을 검색하는 함수"""
    query_embedding = await get_embedding(query_message)
    results = await asyncio.to_thread(index.query, vector=query_embedding, top_k=top_k, filter={'user_id': user_id}, include_metadata=True)
    memories = [match['metadata']['text'] for match in results['matches']]
    print(f"🔍 [{user_id}] 님의 과거 핵심 기억 {len(memories)}개를 검색했습니다.")
    return "\n".join(memories)


# --- 3. 메인 처리 함수 ---
async def process_audio_and_get_response(user_id: str, audio_base64: str):
    audio_data = base64.b64decode(audio_base64)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(audio_data)
        temp_audio_path = temp_audio.name
    
    try:
        with open(temp_audio_path, "rb") as audio_file:
            transcript_response = await asyncio.to_thread(client.audio.transcriptions.create, model="whisper-1", file=audio_file, language="ko")
        user_message = transcript_response.text
        print(f"Whisper 변환 결과: {user_message}")

        relevant_memories = await search_memories(user_id, user_message)

        prompt = f"""
        당신은 친근하고 따뜻한 대화 상대입니다. 아래는 이 사용자와의 과거 대화에서 추출된 핵심 기억입니다. 이 기억을 참고하여 현재 대화에 자연스럽게 응답해주세요.

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
                {"role": "system", "content": "당신은 사용자와의 과거 대화를 기억하고, 그 맥락에 맞춰 따뜻하게 응답하는 AI 말벗입니다."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150,
            temperature=0.7
        )
        ai_response = chat_response.choices[0].message.content
        print(f"GPT-4o 응답: {ai_response}")

        # --- [수정] 새로운 저장 로직 적용 ---
        # 1. 모든 대화는 즉시 MySQL에 저장
        await save_conversation_to_mysql(user_id, user_message, ai_response)

        # 2. 5번에 1번꼴(20% 확률)로 요약 및 Pinecone 저장 실행
        if random.randint(1, 5) == 1:
            await summarize_and_save_memory(user_id)
        
        return user_message, ai_response
    finally:
        os.unlink(temp_audio_path)

# --- 4. 웹소켓 엔드포인트 ---
@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket, user_id: str = Query(...)):
    await manager.connect(websocket)
    print(f"클라이언트 [{user_id}] 연결되었습니다.")
    
    start_question = "안녕하세요! 오늘은 어떤 하루를 보내고 계신가요?"
    await manager.send_json({"type": "ai_message", "content": start_question}, websocket)
    
    summarized = False # 요약 실행 여부를 추적하는 플래그

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # --- [수정] if와 elif를 같은 들여쓰기 레벨로 맞춥니다. ---
            if message_data.get("type") == "audio_data":
                try:
                    user_message, ai_response = await process_audio_and_get_response(
                        user_id, message_data["audio"]
                    )
                    await manager.send_json({"type": "user_message", "content": user_message}, websocket)
                    await manager.send_json({"type": "ai_message", "content": ai_response}, websocket)

                except Exception as e:
                    error_message = f"죄송합니다, 메시지 처리 중 오류가 발생했습니다. (오류: {str(e)})"
                    print(f"❌ 처리 오류: {e}")
                    await manager.send_json({"type": "error", "content": error_message}, websocket)
            
            # 'audio_data'가 아닐 경우, 'end_conversation'인지 확인합니다.
            elif message_data.get("type") == "end_conversation":
                print(f"[{user_id}] 님으로부터 대화 종료 신호를 수신했습니다. 요약을 실행합니다.")
                await summarize_and_save_memory(user_id)
                summarized = True # 요약이 실행되었음을 표시
                break # 루프를 빠져나와 연결을 종료합니다.
                    
    except WebSocketDisconnect:
        print(f"클라이언트 [{user_id}] 연결이 끊어졌습니다.")
    finally:
        # '대화 종료' 버튼으로 이미 요약하지 않은 경우에만, 연결 종료 시 요약 실행
        if not summarized:
            print("연결 종료로 인한 대화 요약을 시작합니다.")
            # 비동기 함수를 호출할 때는 await를 사용해야 합니다.
            await summarize_and_save_memory(user_id)
        
        manager.disconnect(websocket)
        print(f"[{user_id}] 클라이언트와의 모든 처리가 완료되었습니다.")

@app.get("/")
async def root():
    return {"message": "AI Talk Backend is Running"}