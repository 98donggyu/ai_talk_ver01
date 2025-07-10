# app/ai_services.py

import openai
import asyncio
from . import config

client = openai.OpenAI(api_key=config.OPENAI_API_KEY)

async def get_embedding(text: str):
    response = await asyncio.to_thread(
        client.embeddings.create, input=text, model="text-embedding-3-small"
    )
    return response.data[0].embedding

async def get_transcript_from_audio(audio_file_path: str):
    with open(audio_file_path, "rb") as audio_file:
        transcript_response = await asyncio.to_thread(
            client.audio.transcriptions.create, model="whisper-1", file=audio_file, language="ko"
        )
    return transcript_response.text

async def get_ai_chat_completion(prompt: str, model="gpt-4o", max_tokens=150, temperature=0.7):
    messages = [
        {"role": "system", "content": "당신은 주어진 규칙과 페르소나를 완벽하게 따르는 AI 어시스턴트입니다."},
        {"role": "user", "content": prompt}
    ]
    chat_response = await asyncio.to_thread(
        client.chat.completions.create,
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature
    )
    return chat_response.choices[0].message.content