# main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import openai
import os
from dotenv import load_dotenv
import asyncio
import json
import base64
import tempfile

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [수정] 최신 openai 라이브러리에 맞춰 클라이언트를 명확하게 초기화합니다.
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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

async def process_audio_and_get_response(audio_base64: str, conversation_history: list):
    audio_data = base64.b64decode(audio_base64)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(audio_data)
        temp_audio_path = temp_audio.name
    
    try:
        print("🔊 Whisper API 호출 시작...")
        with open(temp_audio_path, "rb") as audio_file:
            transcript_response = await asyncio.to_thread(
                client.audio.transcriptions.create,
                model="whisper-1",
                file=audio_file,
                language="ko"
            )
        user_message = transcript_response.text
        print(f"Whisper 변환 결과: {user_message}")

        conversation_history.append({"role": "user", "content": user_message})
        
        print("🤖 GPT-4o API 호출 시작...")
        chat_response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4o",
            messages=conversation_history,
            max_tokens=150,
            temperature=0.7
        )
        ai_response = chat_response.choices[0].message.content
        print(f"GPT-4o 응답: {ai_response}")

        return user_message, ai_response
    finally:
        os.unlink(temp_audio_path)

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    start_question = "안녕하세요! 오늘은 어떤 하루를 보내고 계신가요?"
    await manager.send_json({"type": "ai_message", "content": start_question}, websocket)
    
    conversation_history = [
        {"role": "system", "content": "당신은 친근하고 따뜻한 대화 상대입니다. 한국어로 자연스럽게 대화해주세요. 답변은 2-3문장으로 간결하게 해주세요."},
        {"role": "assistant", "content": start_question}
    ]
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data.get("type") == "audio_data":
                try:
                    print("✅ 오디오 데이터 수신, 처리 시작")
                    user_message, ai_response = await process_audio_and_get_response(
                        message_data["audio"], conversation_history
                    )

                    print("✅ OpenAI 처리 완료, 응답 전송 시작")
                    await manager.send_json({"type": "user_message", "content": user_message}, websocket)
                    await manager.send_json({"type": "ai_message", "content": ai_response}, websocket)

                except Exception as e:
                    error_message = f"죄송합니다, 메시지 처리 중 오류가 발생했습니다. (오류: {str(e)})"
                    print(f"❌ OpenAI 처리 오류: {e}")
                    await manager.send_json({"type": "error", "content": error_message}, websocket)
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("클라이언트 연결이 끊어졌습니다.")

@app.get("/")
async def root():
    return {"message": "AI Talk Backend Running - Whisper-1 + GPT-4o"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)