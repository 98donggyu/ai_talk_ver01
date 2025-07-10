import openai
import asyncio
import json
import os
from . import config

# 기존 OpenAI 클라이언트 설정을 그대로 사용합니다.
client = openai.OpenAI(api_key=config.OPENAI_API_KEY)

# --- 기존 실시간 대화 관련 함수들 (변경 없음) ---

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


# --- 아래 보고서 생성 관련 함수들을 새로 추가합니다 ---

def get_report_prompt():
    """report_prompt.json 파일을 읽어오는 함수"""
    # 이 파일의 위치를 기준으로 report_prompt.json 경로를 설정합니다.
    prompt_file_path = os.path.join(os.path.dirname(__file__), '..', 'report_prompt.json')
    try:
        with open(prompt_file_path, 'r', encoding='utf-8') as f:
            prompt_data = json.load(f)
        return prompt_data.get("report_analysis_prompt")
    except FileNotFoundError:
        print(f"오류: '{prompt_file_path}' 파일을 찾을 수 없습니다.")
        return None
    except json.JSONDecodeError:
        print(f"오류: '{prompt_file_path}' 파일이 올바른 JSON 형식이 아닙니다.")
        return None

def generate_summary_report(conversation_text: str) -> dict | None:
    """OpenAI 모델을 호출하여 대화 내용 분석을 요청하는 함수 (동기 방식)"""
    
    report_prompt_template = get_report_prompt()
    if not conversation_text or not report_prompt_template:
        print("보고서 프롬프트 또는 대화 내용이 없어 분석을 중단합니다.")
        return None

    # 프롬프트의 각 부분을 변수로 분리합니다.
    persona = report_prompt_template.get('persona', '당신은 전문 대화 분석 AI입니다.')
    instructions = "\n".join(report_prompt_template.get('instructions', []))
    output_format_example = json.dumps(report_prompt_template.get('OUTPUT_FORMAT', {}), ensure_ascii=False, indent=2)

    # AI에게 역할을 부여하고, 반드시 JSON으로만 답하라고 지시하는 '시스템 메시지'
    system_prompt = f"""
{persona}

### 지시사항
{instructions}

### 출력 형식
모든 결과는 아래와 같은 JSON 형식으로만 출력해야 합니다. 추가 설명이나 인사말 등 JSON 외의 텍스트는 절대 포함하지 마세요.
{output_format_example}
"""

    # AI에게 분석을 요청할 실제 대화 내용인 '사용자 메시지'
    user_prompt = f"""
### 분석할 대화 전문
---
{conversation_text}
---
"""

    try:
        # OpenAI API 호출 (JSON 모드 사용)
        # 보고서 생성은 동기적으로 실행되므로, asyncio.to_thread를 사용하지 않습니다.
        completion = client.chat.completions.create(
            model="gpt-4o", 
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        
        response_content = completion.choices[0].message.content
        return json.loads(response_content)

    except Exception as e:
        print(f"AI 리포트 생성 중 오류 발생: {e}")
        return None
