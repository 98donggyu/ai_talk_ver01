import sys
import os
from datetime import date, timedelta
from collections import OrderedDict

# 'backend' 폴더의 경로를 시스템 경로에 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import fetch_daily_conversations, save_summary_to_db, get_all_user_ids_for_yesterday
from app.ai_services import generate_summary_report

# 보고서의 최종 순서를 '설계도'처럼 정의합니다.
REPORT_KEY_ORDER = [
    "리포트_날짜",
    "어르신_ID",
    "일일_대화_요약",
    "키워드_분석",
    "감정_신체_상태",
    "식사_상태_추정",
    "요청_물품",
    "자녀를_위한_추천_대화_주제"
]

def main():
    """보고서 생성을 총괄하는 메인 함수"""
    
    YESTERDAY = date.today() - timedelta(days=1)
    print(f"--- {YESTERDAY.strftime('%Y-%m-%d')} 날짜의 일일 보고서 생성을 시작합니다. ---")
    
    user_ids = get_all_user_ids_for_yesterday()
    if not user_ids:
        print("-> 어제 대화한 사용자가 없어 작업을 종료합니다.")
        return
        
    print(f"-> 총 {len(user_ids)}명의 사용자에 대한 보고서를 생성합니다: {user_ids}")

    for user_id in user_ids:
        try:
            print(f"\n[사용자 ID: {user_id} 작업 시작]")
            
            conversation_text = fetch_daily_conversations(user_id, YESTERDAY)
            if not conversation_text:
                print("-> 대화 내용이 없어 건너뜁니다.")
                continue
            
            print("-> 대화 내용 조회 완료. AI에게 분석을 요청합니다...")
            
            # 1. AI에게는 순수 분석만 요청합니다.
            ai_analysis_result = generate_summary_report(conversation_text)
            
            if ai_analysis_result:
                # 2. 빈 '순서 보장 딕셔너리'를 만듭니다.
                final_report = OrderedDict()

                # 3. 우리가 정의한 순서 목록(REPORT_KEY_ORDER)을 보면서,
                #    하나씩 순서대로 최종 보고서를 조립합니다.
                for key in REPORT_KEY_ORDER:
                    if key == "리포트_날짜":
                        final_report[key] = YESTERDAY.strftime('%Y-%m-%d')
                    elif key == "어르신_ID":
                        final_report[key] = user_id
                    # AI 분석 결과에 해당 키가 있을 경우에만 값을 채워넣습니다.
                    elif key in ai_analysis_result:
                        final_report[key] = ai_analysis_result[key]
                    # AI 분석 결과에 키가 없으면, 기본값(빈 리스트 등)을 넣어줄 수도 있습니다.
                    else:
                        # 예를 들어, 요청 물품이 없으면 빈 리스트로 초기화
                        if key == "요청_물품":
                            final_report[key] = []
                        else:
                            final_report[key] = {} # 기본적으로 빈 객체로 설정

                # 4. 순서가 완벽하게 정리된 최종 보고서를 DB에 저장합니다.
                save_summary_to_db(user_id, YESTERDAY, final_report)
            else:
                print(f"-> 사용자 {user_id}의 AI 보고서 생성에 실패했습니다.")

        except Exception as e:
            print(f"!! 사용자 {user_id} 작업 중 오류 발생: {e}")
            continue
            
    print(f"\n--- 모든 사용자의 보고서 생성이 완료되었습니다. ---")

if __name__ == "__main__":
    main()
