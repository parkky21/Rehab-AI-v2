from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from google import genai
import openai
import os
from dotenv import load_dotenv

load_dotenv()

from api_server.database import get_db
from api_server.deps import require_role

router = APIRouter(prefix="/patient", tags=["ai_feedback"])

async def _generate_ai_response(prompt: str) -> str:
    """Helper to generate AI content using either OpenAI or Gemini depending on available keys."""
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            client = openai.AsyncOpenAI(api_key=openai_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=600
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI error: {e}")
            # fall through to Gemini if it fails, or just raise
            pass
            
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            client = genai.Client(api_key=gemini_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            print(f"Gemini error: {e}")
            raise e
            
    raise ValueError("No valid AI provider configured or both providers failed.")

@router.get("/sessions/{session_id}/ai-feedback")
async def get_session_ai_feedback(
    session_id: str,
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id")
        
    session = await db.sessions.find_one({
        "_id": ObjectId(session_id),
        "patient_id": ObjectId(patient["id"])
    })
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    summary = session.get("summary", {})
    reps = summary.get("reps", [])
    
    if not reps:
        return {"feedback": "Not enough per-rep data is available for this session to generate detailed AI feedback."}
        
    try:
        prompt = f"""
You are an expert physical therapy AI assistant analyzing a patient's exercise session data. 
The patient performed the exercise: '{summary.get('exercise', 'Unknown')}'
Overall Session Stats:
- Total Reps: {summary.get('total_reps', 0)}
- Average Final Score: {summary.get('avg_final_score', 0)}/100
- Average Range of Motion (ROM) Score: {summary.get('avg_rom_score', 0)}/100
- Average Stability Score: {summary.get('avg_stability_score', 0)}/100
- Average Tempo Score: {summary.get('avg_tempo_score', 0)}/100

Here is the per-rep performance data:
"""
        for r in reps:
            prompt += f"Rep {r.get('rep')}: Score={r.get('final_score')}, ROM={r.get('rom_score')}, Stability={r.get('stability_score')}, Tempo={r.get('tempo_score')}, Feedback from system={r.get('feedback', [])}\n"
            
        prompt += """
Based on this data, provide a highly personalized, encouraging, and extremely short and concise feedback summary (maximum 2-3 sentences) for the patient. 
Focus on one key trend (e.g., if their stability decreased in later reps due to fatigue, or if their tempo was too fast). 
Speak directly to the patient in a professional, warm, and clear tone. Do not use markdown formatting like asterisks or bold text, just plain text.
"""
        
        ai_response = await _generate_ai_response(prompt)
        
        return {"feedback": ai_response}
    except ValueError as ve:
        print(f"AI config error: {ve}")
        return {"feedback": "AI feedback is currently unavailable due to missing server configuration or provider errors."}
    except Exception as e:
        print(f"Error generating AI feedback: {e}")
        return {"feedback": "We encountered an issue while generating AI feedback. Please try again later."}

@router.get("/progress/ai-insights")
async def get_global_ai_insights(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    
    sessions = []
    async for doc in db.sessions.find({"patient_id": ObjectId(patient["id"]), "status": "completed"}).sort("started_at", -1).limit(10):
        sessions.append(doc)
    
    if not sessions:
        return {"insights": "Complete a few sessions to get a personalized AI progress summary!"}
        
    latest_session_id = str(sessions[0]["_id"])
    user_doc = await db.users.find_one({"_id": ObjectId(patient["id"])})
    if user_doc:
        cached = user_doc.get("cached_ai_insight")
        if cached and cached.get("latest_session_id") == latest_session_id:
            return {"insights": cached.get("insight")}
    
    scores = [float((session.get("summary") or {}).get("avg_final_score", 0.0)) for session in sessions]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        
    try:
        prompt = f"""
You are an expert physical therapy AI assistant providing a global progress summary to a patient. 
Here are the stats from their last {len(sessions)} completed sessions:
- Average Session Score: {avg_score}/100
- Recent Session Scores: {scores[::-1]} (listed oldest to newest from the {len(sessions)} latest)

Recent Exercises Performed:
"""
        for s in sessions[::-1]:
            summ = s.get("summary", {})
            ex = s.get("exercise_name", "Unknown")
            prompt += f"- {ex}: Score {summ.get('avg_final_score', 0)}, Reps: {summ.get('total_reps', 0)}\n"
            
        prompt += """
Based on these recent sessions, write a very short, highly encouraging, personalized global progress summary (maximum 2-3 sentences). 
Highlight their dedication and any noticeable trends.
Speak directly to the patient in a warm and professional tone. Do not use markdown formatting like asterisks or bold text, just plain text.
"""
        
        ai_response = await _generate_ai_response(prompt)
        
        await db.users.update_one(
            {"_id": ObjectId(patient["id"])},
            {"$set": {
                "cached_ai_insight": {
                    "insight": ai_response,
                    "latest_session_id": latest_session_id
                }
            }}
        )
        
        return {"insights": ai_response}
    except ValueError as ve:
        print(f"AI config error: {ve}")
        return {"insights": "AI insights are currently unavailable due to missing server configuration or provider errors."}
    except Exception as e:
        print(f"Error generating AI insights: {e}")
        return {"insights": "We encountered an issue while generating your progress insights. Please try again later."}


@router.get("/weekly-report")
async def get_weekly_report(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    from datetime import timedelta
    from api_server.utils import utc_now
    
    pid = ObjectId(patient["id"])
    one_week_ago = utc_now() - timedelta(days=7)
    
    sessions = [s async for s in db.sessions.find({"patient_id": pid, "status": "completed", "started_at": {"$gte": one_week_ago}})]
    pain_logs = [p async for p in db.pain_logs.find({"patient_id": pid, "created_at": {"$gte": one_week_ago}})]
    
    if not sessions:
        return {"report": "Not enough activity this week to generate a report."}
        
    avg_score = sum([float((s.get("summary") or {}).get("avg_final_score", 0)) for s in sessions]) / len(sessions)
    avg_pain = sum([float(p.get("score", 0)) for p in pain_logs]) / len(pain_logs) if pain_logs else "No pain reported"
    
    prompt = f"""
You are an expert physical therapy AI. Generate a weekly performance audit for the patient based on their last 7 days of data.
Stats this week:
- Sessions Completed: {len(sessions)}
- Average Form Score: {round(avg_score, 1)}/100
- Average Pain Level: {avg_pain} (0-10 scale)

Write a 2-paragraph professional, encouraging summary of their week. Discuss their form accuracy and pain trends. Do not use markdown formatting.
"""
    try:
        report_text = await _generate_ai_response(prompt)
        return {
            "report_text": report_text,
            "metrics": {
                "sessions_completed": len(sessions),
                "avg_form_score": round(avg_score, 1),
                "avg_pain": avg_pain
            }
        }
    except Exception as e:
        return {"report": "Error generating report.", "error": str(e)}
