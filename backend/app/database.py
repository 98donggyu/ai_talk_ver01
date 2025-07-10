# app/database.py

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta, timezone # timezone 추가
import asyncio

from . import config
from .ai_services import get_ai_chat_completion

# SQLAlchemy 엔진 및 세션 설정 (이전과 동일)
engine = None

def init_db():
    """서버 시작 시 데이터베이스와 테이블을 확인하고 생성합니다."""
    global engine
    try:
        server_engine = create_engine(config.SERVER_DATABASE_URL)
        with server_engine.connect() as connection:
            connection.execute(text(f"CREATE DATABASE IF NOT EXISTS {config.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        
        engine = create_engine(config.DATABASE_URL)
        with engine.connect() as connection:
            print("'conversations'와 'summaries' 테이블 확인 및 생성 시도...")
            
            # ✅ [수정] conversations 테이블 생성 완전한 구문
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                user_message TEXT NOT NULL,
                ai_message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """))

            # ✅ [수정] summaries 테이블 생성 완전한 구문
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
        return True
    except Exception as e:
        print(f"❌ 데이터베이스 설정 중 오류 발생: {e}")
        return False

SessionLocal = None
if init_db():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    exit("데이터베이스 연결 실패로 서버를 시작할 수 없습니다.")


async def save_conversation_to_mysql(user_id: str, user_message: str, ai_message: str):
    # ... (이전과 동일한 코드)
    db = SessionLocal()
    try:
        query = text("INSERT INTO conversations (user_id, user_message, ai_message) VALUES (:user_id, :user_message, :ai_message)")
        await asyncio.to_thread(db.execute, query, {"user_id": user_id, "user_message": user_message, "ai_message": ai_message})
        await asyncio.to_thread(db.commit)
    finally:
        db.close()


# ✅ [수정] create_hourly_summary_report 함수 전체를 아래 내용으로 교체
async def create_hourly_summary_report(user_id: str):
    """
    한국 시간(KST) 17시에 새로운 대화가 있을 경우,
    하루 한 번 리포트를 생성합니다.
    """
    print(f"🗓️ [{user_id}] 님의 일일 리포트 생성 여부를 확인합니다.")
    
    # 1. 한국 시간대(KST, UTC+9)를 정의합니다.
    KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(KST)
    
    # 2. 지금이 17시가 아니면, 함수를 즉시 종료합니다.
    if now_kst.hour != 17:
        print(f"-> 현재 시간({now_kst.hour}시)이 17시가 아니므로 리포트를 생성하지 않습니다.")
        return

    db = SessionLocal()
    try:
        # 3. 오늘 17시 이전에 이미 리포트가 생성되었는지 확인합니다.
        today_report_time_kst = now_kst.replace(hour=17, minute=0, second=0, microsecond=0)
        
        last_summary_query = text("SELECT created_at FROM summaries WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 1")
        last_summary_time = db.execute(last_summary_query, {"user_id": user_id}).scalar_one_or_none()

        if last_summary_time:
            # DB 시간(UTC)을 한국 시간(KST)으로 변환하여 비교
            last_summary_time_kst = last_summary_time.astimezone(KST)
            if last_summary_time_kst >= today_report_time_kst:
                print(f"-> 오늘 17시 리포트는 이미 생성되었습니다. (마지막 리포트: {last_summary_time_kst.strftime('%H:%M')})")
                return

        # 4. 리포트에 포함할 새로운 대화 내용을 가져옵니다.
        start_time = last_summary_time or datetime.min
        new_conv_query = text("SELECT user_message, ai_message FROM conversations WHERE user_id = :user_id AND created_at > :start_time")
        new_conversations = db.execute(new_conv_query, {"user_id": user_id, "start_time": start_time}).fetchall()

        if not new_conversations:
            print("-> 리포트에 추가할 새로운 대화 내용이 없습니다.")
            return

        print(f"-> 새로운 대화 {len(new_conversations)}건을 바탕으로 일일 리포트를 생성합니다.")
        conversation_history = "\n".join([f"사용자: {row[0]}\nAI: {row[1]}" for row in new_conversations])
        report_prompt = f"다음은 사용자의 최근 대화 내용입니다. 이 내용을 바탕으로 사용자의 상태와 주요 대화 내용을 요약하는 '일일 리포트'를 작성해주세요.\n\n--- 대화 내용 ---\n{conversation_history}\n-----------------\n\n일일 리포트:"
        
        report_text = await get_ai_chat_completion(report_prompt)
        
        summary_save_query = text("INSERT INTO summaries (user_id, summary_text) VALUES (:user_id, :summary_text)")
        db.execute(summary_save_query, {"user_id": user_id, "summary_text": report_text})
        db.commit()
        print(f"✅ [{user_id}] 님의 일일 리포트가 MySQL summaries 테이블에 저장되었습니다.")

    finally:
        db.close()