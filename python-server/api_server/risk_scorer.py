from datetime import timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from api_server.utils import utc_now

async def calculate_patient_risk(db: AsyncIOMotorDatabase, patient_id: ObjectId) -> dict:
    """
    Computes a risk score and triage status for a patient based on:
    - Recent session scores
    - Adherence (assignments completed vs total)
    - Recent pain logs
    - Recency of last session

    Returns:
    {
        "status": str (Excellent, On track, Watch, At risk, Critical),
        "score": int (0-100, where 100 is best, 0 is highest risk),
        "factors": list[str] (Explanations for the score)
    }
    """
    factors = []
    base_score = 100.0

    # 1. Adherence
    assignments_cursor = db.exercise_assignments.find({"patient_id": patient_id})
    total_assignments = 0
    completed_assignments = 0
    async for a in assignments_cursor:
        total_assignments += 1
        if a.get("status") == "completed":
            completed_assignments += 1
            
    adherence = (completed_assignments / total_assignments) if total_assignments > 0 else 1.0
    
    if adherence < 0.5:
        base_score -= 20
        factors.append("Very low adherence (< 50%)")
    elif adherence < 0.8:
        base_score -= 10
        factors.append("Low adherence (< 80%)")

    # 2. Session Scores & Recency
    sessions_cursor = db.sessions.find(
        {"patient_id": patient_id, "status": "completed"}
    ).sort("started_at", -1).limit(5)
    
    recent_sessions = [s async for s in sessions_cursor]
    
    if not recent_sessions:
        base_score -= 15
        factors.append("No completed sessions yet")
    else:
        # Check recency
        last_session_time = recent_sessions[0].get("ended_at") or recent_sessions[0].get("started_at")
        if last_session_time:
            if last_session_time.tzinfo is None:
                from datetime import timezone
                last_session_time = last_session_time.replace(tzinfo=timezone.utc)
            days_since_last = (utc_now() - last_session_time).days
            if days_since_last > 7:
                base_score -= 25
                factors.append(f"No sessions in {days_since_last} days")
            elif days_since_last > 3:
                base_score -= 10
                factors.append("No sessions in over 3 days")

        # Check scores
        scores = [float((s.get("summary") or {}).get("avg_final_score", 0.0)) for s in recent_sessions]
        avg_score = sum(scores) / len(scores) if scores else 0.0
        
        if avg_score < 50:
            base_score -= 20
            factors.append(f"Very low average score ({round(avg_score, 1)}/100)")
        elif avg_score < 70:
            base_score -= 10
            factors.append(f"Below average score ({round(avg_score, 1)}/100)")
            
        # Check trend
        if len(scores) >= 3:
            if scores[0] < scores[-1] - 10:  # Newest is 10 points lower than oldest
                base_score -= 15
                factors.append("Declining performance trend")

    # 3. Pain Logs
    pain_cursor = db.pain_logs.find({"patient_id": patient_id}).sort("created_at", -1).limit(3)
    recent_pains = [p async for p in pain_cursor]
    if recent_pains:
        avg_pain = sum([p.get("score", 0) for p in recent_pains]) / len(recent_pains)
        if avg_pain >= 7:
            base_score -= 30
            factors.append(f"High recent pain levels (avg {round(avg_pain, 1)}/10)")
        elif avg_pain >= 5:
            base_score -= 15
            factors.append(f"Moderate recent pain (avg {round(avg_pain, 1)}/10)")

    final_score = max(0, min(100, int(base_score)))
    
    # Determine status
    if final_score >= 90:
        status = "Excellent"
    elif final_score >= 75:
        status = "On track"
    elif final_score >= 60:
        status = "Watch"
    elif final_score >= 40:
        status = "At risk"
    else:
        status = "Critical"
        
    if not factors:
        factors.append("Patient is progressing well.")

    return {
        "status": status,
        "score": final_score,
        "factors": factors
    }
