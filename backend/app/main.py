# app/main.py

import os
import json
import base64
import tempfile
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

# 분리된 모듈들에서 필요한 함수와 객체들을 import
from . import config
from .database import save_conversation_to_mysql, create_hourly_summary_report
from .ai_services import get_transcript_from_audio, get_ai_chat_completion
from .vector_db import create_memory_for_pinecone, search_memories
from .websocket_manager import manager, session_conversations

# prompts.json 파일 로드
try:
    with open('prompts.json', 'r', encoding='utf-8') as f:
        PROMPTS_CONFIG = json.load(f)['main_chat_prompt']
    print("✅ prompts.json 파일을 성공적으로 불러왔습니다.")
except FileNotFoundError:
    print("❌ prompts.json 파일을 찾을 수 없습니다. app 폴더 안에 있는지 확인해주세요.")
    exit()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


async def process_audio_and_get_response(user_id: str, audio_base64: str):
    """오디오 처리부터 AI 응답 생성까지의 비즈니스 로직을 담당"""
    audio_data = base64.b64decode(audio_base64)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(audio_data); temp_audio_path = temp_audio.name
    try:
        user_message = await get_transcript_from_audio(temp_audio_path)
        if not user_message.strip() or "시청해주셔서 감사합니다" in user_message:
            return None, "음, 잘 알아듣지 못했어요. 혹시 다시 한번 말씀해주시겠어요?"
        
        relevant_memories = await search_memories(user_id, user_message)
        
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
        ai_response = await get_ai_chat_completion(final_prompt)
        
        await save_conversation_to_mysql(user_id, user_message, ai_response)
        
        if user_id in session_conversations:
            session_conversations[user_id].append(f"사용자: {user_message}")
            session_conversations[user_id].append(f"AI: {ai_response}")
            
        return user_message, ai_response
    finally:
        os.unlink(temp_audio_path)

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
                if user_message: await manager.send_json({"type": "user_message", "content": user_message}, user_id)
                await manager.send_json({"type": "ai_message", "content": ai_response}, user_id)
    except WebSocketDisconnect:
        print(f"클라이언트 [{user_id}] 연결이 끊어졌습니다.")
    finally:
        if user_id in session_conversations:
            current_session_log = session_conversations.pop(user_id)
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