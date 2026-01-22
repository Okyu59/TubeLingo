import os
import json
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from openai import OpenAI

# 1. 앱 설정
app = FastAPI()

# CORS 설정 (프론트엔드에서 접근 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 배포 시 프론트엔드 도메인으로 제한 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI 클라이언트 (환경변수에서 키 로드)
# Railway 변수 설정에서 OPENAI_API_KEY를 추가해야 합니다.
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# 2. 데이터 모델 정의
class AnalyzeRequest(BaseModel):
    url: str

# 3. 헬퍼 함수
def extract_video_id(url: str):
    """유튜브 URL에서 Video ID 추출"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:youtu\.be\/)([0-9A-Za-z_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_transcript(video_id: str):
    """자막 추출 (한국어 -> 영어 순)"""
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['ko', 'en', 'en-US'])
        return transcript
    except Exception as e:
        print(f"Transcript Error: {e}")
        return None

# 4. 메인 API 엔드포인트
@app.post("/api/analyze")
async def analyze_video(req: AnalyzeRequest):
    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="유효하지 않은 유튜브 URL입니다.")

    # 자막 가져오기
    raw_transcript = get_transcript(video_id)
    if not raw_transcript:
        raise HTTPException(status_code=404, detail="자막을 찾을 수 없는 영상입니다.")

    # 프롬프트 생성을 위한 텍스트 병합 (길이 제한 고려)
    full_text = " ".join([t['text'] for t in raw_transcript])[:15000]

    # AI에게 보낼 시스템 프롬프트
    system_prompt = """
    You are an expert language tutor API. 
    Analyze the provided YouTube transcript and generate a structured JSON response for a learning app.
    
    The response MUST be a valid JSON object with this exact structure:
    {
        "title": "Video Title (Translate to Korean if needed)",
        "script": [
            {"time": float(seconds), "text": "Original sentence", "kr": "Korean translation"}
        ],
        "vocabulary": [
            {"word": "vocabulary word", "meaning": "Korean meaning", "type": "noun/verb/adj"}
        ],
        "quizBank": [
            {
                "difficulty": "easy/normal/hard",
                "question": "Question text",
                "options": ["Opt1", "Opt2", "Opt3", "Opt4"],
                "answer": int(index of correct option 0-3),
                "rationale": "Explanation in Korean"
            }
        ]
    }
    
    Requirements:
    1. 'script': Extract key sentences (every 10-20 seconds roughly) ensuring smooth flow.
    2. 'quizBank': Generate at least 3 questions (1 easy, 1 normal, 1 hard).
    3. Return ONLY raw JSON. No markdown formatting.
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o", # 또는 gpt-3.5-turbo
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Transcript:\n{full_text}"}
            ],
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # 비디오 ID 추가하여 반환
        result['videoId'] = video_id
        
        # 썸네일은 프론트에서 처리하므로 ID만 주면 됨
        return result

    except Exception as e:
        print(f"AI Error: {e}")
        raise HTTPException(status_code=500, detail="AI 분석 중 오류가 발생했습니다.")

@app.get("/")
def health_check():
    return {"status": "ok", "service": "TubeLingo Backend"}
