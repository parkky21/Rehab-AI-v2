from bson import ObjectId
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from api_server.database import get_db
from api_server.deps import require_role
from api_server.utils import serialize_doc, utc_now
from api_server.schemas import PainLogRequest
import os
import openai
from google import genai

router = APIRouter(prefix="/patient", tags=["patient"])

async def _generate_ai_response(prompt: str) -> str:
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
        except Exception:
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
        except Exception:
            pass
            
    return "AI validation currently unavailable."


def _trend_label(values: list[float]) -> str:
    if len(values) < 2:
        return "insufficient_data"
    delta = values[-1] - values[0]
    if delta > 3.0:
        return "improving"
    if delta < -3.0:
        return "declining"
    return "stable"


@router.get("/assignments")
async def my_assignments(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    cursor = db.exercise_assignments.find(
        {"patient_id": ObjectId(patient["id"]), "status": {"$in": ["assigned", "in_progress"]}}
    ).sort("created_at", -1)
    assignments = [serialize_doc(doc) async for doc in cursor]
    return {"assignments": assignments}


@router.get("/roadmap")
async def my_roadmap(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    roadmap = await db.clinical_roadmaps.find_one({"patient_id": ObjectId(patient["id"])}, sort=[("created_at", -1)])
    if roadmap:
        return {"roadmap": serialize_doc(roadmap)}
    return {"roadmap": None}

@router.get("/sessions")
async def my_sessions(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    cursor = db.sessions.find({"patient_id": ObjectId(patient["id"])}).sort("started_at", -1).limit(100)
    sessions = [serialize_doc(doc) async for doc in cursor]
    return {"sessions": sessions}


@router.get("/progress")
async def my_progress(
    exercise_name: str | None = None,
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    session_filter: dict = {"patient_id": ObjectId(patient["id"]), "status": "completed"}
    if exercise_name:
        session_filter["exercise_name"] = exercise_name

    sessions = [serialize_doc(doc) async for doc in db.sessions.find(session_filter).sort("started_at", 1)]
    scores = [float((session.get("summary") or {}).get("avg_final_score", 0.0)) for session in sessions]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    assignments_filter: dict = {"patient_id": ObjectId(patient["id"])}
    if exercise_name:
        assignments_filter["exercise_name"] = exercise_name
    total_assignments = await db.exercise_assignments.count_documents(assignments_filter)
    completed_assignments = await db.exercise_assignments.count_documents({**assignments_filter, "status": "completed"})
    adherence = round((completed_assignments / total_assignments) * 100.0, 1) if total_assignments else 0.0

    progression_filter: dict = {"patient_id": ObjectId(patient["id"])}
    if exercise_name:
        progression_filter["exercise_name"] = exercise_name
    latest_snapshot = await db.progression_snapshots.find_one(progression_filter, sort=[("snapshot_at", -1)])

    return {
        "patient_id": patient["id"],
        "exercise_name": exercise_name,
        "session_count": len(sessions),
        "avg_final_score": avg_score,
        "trend": _trend_label(scores[-5:]),
        "adherence_percent": adherence,
        "recent_scores": scores[-10:],
        "latest_progression": serialize_doc(latest_snapshot),
        "recent_sessions": sessions[-10:],
    }


@router.get("/feedback")
async def my_feedback(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    cursor = db.doctor_feedback.find(
        {"patient_id": ObjectId(patient["id"])}
    ).sort("created_at", -1).limit(50)
    feedback_list = [serialize_doc(doc) async for doc in cursor]
    return {"feedback": feedback_list}


@router.post("/pain-logs")
async def log_pain(
    payload: PainLogRequest,
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    # Fetch today's latest session to validate pain
    latest_session = await db.sessions.find_one(
        {"patient_id": ObjectId(patient["id"]), "status": "completed"},
        sort=[("started_at", -1)]
    )
    
    validation_note = None
    if latest_session and latest_session.get("summary"):
        summary = latest_session["summary"]
        prompt = f"""
You are an expert AI physical therapist. The patient reported a pain score of {payload.score}/10 today.
Here are their stats from their most recent session today:
- Average ROM Score: {summary.get('avg_rom_score', 'N/A')}/100
- Average Stability Score: {summary.get('avg_stability_score', 'N/A')}/100
- Average Tempo Score: {summary.get('avg_tempo_score', 'N/A')}/100

Does the reported pain score align with their movement data? If they report low pain but have terrible ROM/stability, or high pain but perfect movement, flag it gently. Keep it to 1-2 short sentences.
"""
        validation_note = await _generate_ai_response(prompt)

    pain_doc = {
        "patient_id": ObjectId(patient["id"]),
        "score": payload.score,
        "location": payload.location,
        "notes": payload.notes,
        "validation_note": validation_note,
        "created_at": utc_now(),
    }
    result = await db.pain_logs.insert_one(pain_doc)
    return {"status": "created", "pain_log_id": str(result.inserted_id), "validation_note": validation_note}

@router.get("/pain-logs")
async def get_pain_logs(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    cursor = db.pain_logs.find({"patient_id": ObjectId(patient["id"])}).sort("created_at", -1).limit(30)
    logs = [serialize_doc(doc) async for doc in cursor]
    return {"pain_logs": logs}


@router.get("/recovery-score")
async def get_recovery_score(
    patient: dict = Depends(require_role({"patient"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = ObjectId(patient["id"])
    
    # 1. User's reported pain (65% priority)
    recent_pains_cursor = db.pain_logs.find({"patient_id": pid}).sort("created_at", 1)
    recent_pains_docs = [serialize_doc(p) async for p in recent_pains_cursor]
    
    # Calculate avg pain from last 3 for the current score
    latest_pains = recent_pains_docs[-3:] if recent_pains_docs else []
    avg_pain = sum([p.get("score", 0) for p in latest_pains]) / len(latest_pains) if latest_pains else 0.0
    user_score = max(0, 100 - (avg_pain * 10))
    
    # Previous pain
    prev_pains = recent_pains_docs[-6:-3] if len(recent_pains_docs) > 3 else []
    prev_avg_pain = sum([p.get("score", 0) for p in prev_pains]) / len(prev_pains) if prev_pains else avg_pain
    prev_user_score = max(0, 100 - (prev_avg_pain * 10))
    
    # 2. Analysis Score (35% priority)
    sessions = [s async for s in db.sessions.find({"patient_id": pid, "status": "completed"}).sort("started_at", -1).limit(10)]
    
    current_sessions = sessions[:5]
    prev_sessions = sessions[5:10] if len(sessions) > 5 else current_sessions
    
    def calc_analysis(sess_list):
        r_scores = [float((s.get("summary") or {}).get("avg_rom_score", 0.0)) for s in sess_list]
        t_scores = [float((s.get("summary") or {}).get("avg_tempo_score", 0.0)) for s in sess_list]
        a_r = sum(r_scores) / len(r_scores) if r_scores else 0.0
        a_t = sum(t_scores) / len(t_scores) if t_scores else 0.0
        return (a_r + a_t) / 2.0, a_r, a_t

    analysis_score, avg_rom, avg_tempo = calc_analysis(current_sessions)
    prev_analysis_score, _, _ = calc_analysis(prev_sessions)
    
    composite_score = (user_score * 0.65) + (analysis_score * 0.35)
    prev_composite_score = (prev_user_score * 0.65) + (prev_analysis_score * 0.35)
    
    score_delta = composite_score - prev_composite_score
    pain_delta = avg_pain - prev_avg_pain
    
    return {
        "recovery_score": round(composite_score, 1),
        "score_delta": round(score_delta, 1),
        "recent_pains": [p.get("score", 0) for p in recent_pains_docs[-10:]],
        "avg_pain": round(avg_pain, 1),
        "pain_delta": round(pain_delta, 1),
        "components": {
            "user_score": round(user_score, 1),
            "analysis_score": round(analysis_score, 1),
            "avg_rom": round(avg_rom, 1),
            "avg_tempo": round(avg_tempo, 1)
        }
    }


