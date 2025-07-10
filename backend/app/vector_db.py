# app/vector_db.py

import uuid
import time
import asyncio
from pinecone import Pinecone, ServerlessSpec

from . import config
from .ai_services import get_embedding, get_ai_chat_completion

pc = Pinecone(api_key=config.PINECONE_API_KEY)
if config.PINECONE_INDEX_NAME not in pc.list_indexes().names():
    pc.create_index(
        name=config.PINECONE_INDEX_NAME, dimension=1536, metric="cosine", 
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
index = pc.Index(config.PINECONE_INDEX_NAME)
print(f"✅ Pinecone '{config.PINECONE_INDEX_NAME}' 인덱스에 성공적으로 연결되었습니다.")


async def create_memory_for_pinecone(user_id: str, current_session_log: list):
    print(f"🧠 [{user_id}] 님의 세션 기억 생성을 시작합니다.")
    if not current_session_log: return

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
        memory_text = await get_ai_chat_completion(summary_prompt.format(conversation_history=conversation_history), max_tokens=200, temperature=0.3)
        memory_type = 'summary'

    print(f"📝 생성된 기억 (타입: {memory_type}): {memory_text}")
    embedding = await get_embedding(memory_text)
    
    vector_to_upsert = {
        'id': str(uuid.uuid4()), 'values': embedding,
        'metadata': {'user_id': user_id, 'text': memory_text, 'timestamp': int(time.time()), 'memory_type': memory_type}
    }
    await asyncio.to_thread(index.upsert, vectors=[vector_to_upsert])
    print(f"✅ [{user_id}] 님의 새로운 세션 기억이 Pinecone에 저장되었습니다.")


async def search_memories(user_id: str, query_message: str, top_k=5):
    query_embedding = await get_embedding(query_message)
    results = await asyncio.to_thread(index.query, vector=query_embedding, top_k=top_k, filter={'user_id': user_id}, include_metadata=True)
    
    now, ranked_memories = int(time.time()), []
    for match in results['matches']:
        similarity_score = match['score']; metadata = match.get('metadata', {}); timestamp = metadata.get('timestamp', now)
        time_decay_factor = 30 * 24 * 60 * 60
        recency_score = max(0, (timestamp - (now - time_decay_factor)) / time_decay_factor)
        final_score = (similarity_score * 0.7) + (recency_score * 0.3)
        ranked_memories.append({'text': metadata.get('text', ''), 'score': final_score})
        
    ranked_memories.sort(key=lambda x: x['score'], reverse=True)
    top_memories = [item['text'] for item in ranked_memories[:3]]
    print(f"🔍 [{user_id}] 님의 과거 핵심 기억 {len(top_memories)}개를 재정렬하여 검색했습니다.")
    return "\n".join(top_memories)