from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import date, datetime, timedelta
import json
import asyncio

from . import config

# SQLAlchemy 엔진 및 세션 설정
engine = None

def init_db():
    """서버 시작 시 데이터베이스와 테이블을 확인하고 생성합니다."""
    global engine
    try:
        # DB가 없으면 생성
        server_engine = create_engine(config.SERVER_DATABASE_URL)
        with server_engine.connect() as connection:
            connection.execute(text(f"CREATE DATABASE IF NOT EXISTS {config.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        
        engine = create_engine(config.DATABASE_URL)
        with engine.connect() as connection:
            print("'conversations'와 'summaries' 테이블 확인 및 생성 시도...")
            
            # conversations 테이블 구조 수정 (speaker 컬럼 추가)
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                speaker VARCHAR(50) NOT NULL, -- 'user' 또는 'ai'
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id, created_at)
            );
            """))

            # summaries 테이블 구조 개선 (report_date, summary_json 추가)
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS summaries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                report_date DATE NOT NULL,
                summary_json JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY (user_id, report_date) -- 사용자는 하루에 하나의 리포트만 가짐
            );
            """))
            print("-> 테이블 준비 완료.")
            
        print("✅ MySQL 데이터베이스 및 테이블이 성공적으로 준비되었습니다.")
        return True
    except Exception as e:
        # JSON 타입이 지원되지 않는 구버전 MySQL일 경우 TEXT로 대체 시도
        if "1064" in str(e) and "JSON" in str(e).upper():
            with engine.connect() as connection:
                print("⚠️ JSON 타입 미지원. TEXT 타입으로 summaries 테이블을 다시 생성합니다.")
                connection.execute(text("""
                CREATE TABLE IF NOT EXISTS summaries (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    report_date DATE NOT NULL,
                    summary_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY (user_id, report_date)
                );
                """))
                print("-> TEXT 타입으로 테이블 준비 완료.")
            return True
        print(f"❌ 데이터베이스 설정 중 오류 발생: {e}")
        return False

SessionLocal = None
if init_db():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    exit("데이터베이스 연결 실패로 서버를 시작할 수 없습니다.")


async def save_conversation_to_mysql(user_id: str, user_message: str, ai_message: str):
    """실시간 대화를 DB에 저장하는 함수 (구조 변경에 맞춰 수정)"""
    db = SessionLocal()
    try:
        # 사용자 대화 저장
        user_query = text("INSERT INTO conversations (user_id, speaker, message) VALUES (:user_id, 'user', :message)")
        await asyncio.to_thread(db.execute, user_query, {"user_id": user_id, "message": user_message})
        
        # AI 대화 저장
        ai_query = text("INSERT INTO conversations (user_id, speaker, message) VALUES (:user_id, 'ai', :message)")
        await asyncio.to_thread(db.execute, ai_query, {"user_id": user_id, "message": ai_message})

        await asyncio.to_thread(db.commit)
    finally:
        db.close()


def fetch_daily_conversations(user_id: str, target_date: date) -> str:
    """특정 사용자의 하루치 대화 내용을 DB에서 가져오는 함수"""
    db = SessionLocal()
    try:
        query = text("""
            SELECT speaker, message FROM conversations
            WHERE user_id = :user_id AND DATE(created_at) = :target_date
            ORDER BY created_at ASC
        """)
        results = db.execute(query, {"user_id": user_id, "target_date": target_date}).fetchall()
        
        if not results:
            return ""
            
        # 대화 기록을 "speaker: message" 형식으로 조합
        formatted_text = "\n".join([f"{speaker}: {message}" for speaker, message in results])
        return formatted_text
    finally:
        db.close()

def save_summary_to_db(user_id: str, report_date: date, summary_json: dict):
    """분석된 보고서를 summaries 테이블에 저장하는 함수"""
    db = SessionLocal()
    try:
        # JSON 객체를 문자열로 변환하여 저장
        summary_text = json.dumps(summary_json, ensure_ascii=False)
        
        query = text("""
            INSERT INTO summaries (user_id, report_date, summary_json)
            VALUES (:user_id, :report_date, :summary_json)
            ON DUPLICATE KEY UPDATE summary_json = VALUES(summary_json)
        """)
        
        db.execute(query, {"user_id": user_id, "report_date": report_date, "summary_json": summary_text})
        db.commit()
        print(f"성공: 사용자 {user_id}의 {report_date} 보고서가 저장되었습니다.")
    finally:
        db.close()

def get_all_user_ids_for_yesterday() -> list[str]:
    """어제 대화가 있었던 모든 사용자 ID 목록을 가져오는 함수"""
    db = SessionLocal()
    try:
        yesterday = date.today() - timedelta(days=1)
        query = text("""
            SELECT DISTINCT user_id FROM conversations
            WHERE DATE(created_at) = :yesterday
        """)
        results = db.execute(query, {"yesterday": yesterday}).fetchall()
        user_ids = [item[0] for item in results]
        return user_ids
    finally:
        db.close()