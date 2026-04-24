from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
import os
import json
import openai
from google import genai

from api_server.database import get_db
from api_server.deps import require_role
from api_server.exercise_factory import list_exercises
from api_server.risk_scorer import calculate_patient_risk
from api_server.schemas import (
    AssignmentCreateRequest,
    AssignmentResponse,
    DoctorFeedbackRequest,
    PatientAssignmentStats,
    PatientLinkRequest,
    UserProfile,
)
from api_server.utils import serialize_doc, to_object_id, utc_now

router = APIRouter(prefix="/doctor", tags=["doctor"])


def _public_patient(patient_doc: dict) -> dict:
    return {
        "id": str(patient_doc["_id"]),
        "name": patient_doc.get("name"),
        "email": patient_doc.get("email"),
        "username": patient_doc.get("username"),
        "role": patient_doc.get("role"),
        "created_at": patient_doc.get("created_at"),
    }


def _trend_label(values: list[float]) -> str:
    if len(values) < 2:
        return "insufficient_data"
    delta = values[-1] - values[0]
    if delta > 3.0:
        return "improving"
    if delta < -3.0:
        return "declining"
    return "stable"


async def _generate_ai_roadmap(protocol: str) -> str:
    prompt = f"""
You are an expert physical therapist. Create a 4-phase clinical roadmap for a patient recovering using the protocol: "{protocol}".
Return the response strictly as a JSON list of objects. Each object must have these keys:
- "title": A short phase title (e.g., "Week 1-2: Mobility")
- "description": A 1-2 sentence description of the goal.
- "target_week": The week number this phase starts (integer).
- "status": "pending"
Example:
[
  {{"title": "Phase 1: Protection", "description": "Reduce swelling.", "target_week": 1, "status": "pending"}},
  ...
]
Do not return any markdown formatting, only the JSON array.
"""
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            client = openai.AsyncOpenAI(api_key=openai_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=600,
                temperature=0.7
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

    return "[]"

async def _build_roadmap_bg_task(protocol: str, patient_id: ObjectId, doctor_id: ObjectId, db: AsyncIOMotorDatabase):
    try:
        res = await _generate_ai_roadmap(protocol)
        res = res.replace("```json", "").replace("```", "").strip()
        milestones = json.loads(res)
        if isinstance(milestones, list) and len(milestones) > 0:
            doc = {
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "protocol": protocol,
                "milestones": milestones,
                "created_at": utc_now(),
                "updated_at": utc_now()
            }
            # Remove old roadmap for this patient and add the new one
            await db.clinical_roadmaps.delete_many({"patient_id": patient_id})
            await db.clinical_roadmaps.insert_one(doc)
    except Exception as e:
        print(f"Error generating roadmap: {e}")

async def _assert_linked(db: AsyncIOMotorDatabase, doctor_id: str, patient_id: ObjectId) -> None:
    linked = await db.doctor_patient_links.find_one(
        {
            "doctor_id": ObjectId(doctor_id),
            "patient_id": patient_id,
            "status": "active",
        }
    )
    if not linked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient is not linked to this doctor")


@router.post("/patients/link")
async def link_patient(
    payload: PatientLinkRequest,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    patient_doc = None

    if payload.patient_id:
        patient_id = to_object_id(payload.patient_id, "patient_id")
        patient_doc = await db.users.find_one({"_id": patient_id, "role": "patient"})
    elif payload.patient_email:
        patient_doc = await db.users.find_one(
            {"email": payload.patient_email.strip().lower(), "role": "patient"}
        )
    elif payload.patient_username:
        patient_doc = await db.users.find_one(
            {"username": payload.patient_username.strip().lower(), "role": "patient"}
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide one of patient_id, patient_email, or patient_username",
        )

    if not patient_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    patient_id = patient_doc["_id"]

    link_doc = {
        "doctor_id": ObjectId(doctor["id"]),
        "patient_id": patient_id,
        "status": "active",
        "created_at": utc_now(),
    }
    await db.doctor_patient_links.update_one(
        {"doctor_id": link_doc["doctor_id"], "patient_id": link_doc["patient_id"]},
        {"$setOnInsert": link_doc},
        upsert=True,
    )

    return {
        "status": "linked",
        "patient_id": str(patient_id),
        "patient_email": patient_doc.get("email"),
        "patient_username": patient_doc.get("username"),
    }


@router.post("/assignments", response_model=AssignmentResponse)
async def create_assignment(
    payload: AssignmentCreateRequest,
    background_tasks: BackgroundTasks,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AssignmentResponse:
    if payload.exercise_name not in list_exercises():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported exercise")

    patient_id = to_object_id(payload.patient_id, "patient_id")

    await _assert_linked(db, doctor["id"], patient_id)

    doctor_doc = await db.users.find_one({"_id": ObjectId(doctor["id"])})
    doctor_name = doctor_doc.get("name", "Doctor") if doctor_doc else "Doctor"

    assignment_doc = {
        "doctor_id": ObjectId(doctor["id"]),
        "doctor_name": doctor_name,
        "patient_id": patient_id,
        "exercise_name": payload.exercise_name,
        "target_reps": payload.target_reps,
        "target_sets": payload.target_sets,
        "rest_interval_seconds": payload.rest_interval_seconds,
        "protocol": payload.protocol,
        "due_date": payload.due_date,
        "notes": payload.notes,
        "status": "assigned",
        "created_at": utc_now(),
    }
    result = await db.exercise_assignments.insert_one(assignment_doc)
    
    if payload.protocol:
        background_tasks.add_task(_build_roadmap_bg_task, payload.protocol, patient_id, ObjectId(doctor["id"]), db)

    assignment = serialize_doc({"_id": result.inserted_id, **assignment_doc})
    return AssignmentResponse(**assignment)


@router.get("/patients/{patient_id}/sessions")
async def get_patient_sessions(
    patient_id: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")

    await _assert_linked(db, doctor["id"], pid)

    cursor = db.sessions.find({"patient_id": pid}).sort("started_at", -1).limit(100)
    sessions = [serialize_doc(doc) async for doc in cursor]
    return {"sessions": sessions}


@router.get("/patients/{patient_id}/roadmap")
async def get_patient_roadmap(
    patient_id: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)
    roadmap = await db.clinical_roadmaps.find_one({"patient_id": pid}, sort=[("created_at", -1)])
    if roadmap:
        return {"roadmap": serialize_doc(roadmap)}
    return {"roadmap": None}

@router.get("/patients/{patient_id}/assignments")
async def get_patient_assignments(
    patient_id: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)

    cursor = db.exercise_assignments.find(
        {"doctor_id": ObjectId(doctor["id"]), "patient_id": pid}
    ).sort("created_at", -1)
    assignments = [serialize_doc(doc) async for doc in cursor]
    return {"assignments": assignments}


@router.get("/patients")
async def get_linked_patients(
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    links = db.doctor_patient_links.find({"doctor_id": ObjectId(doctor["id"]), "status": "active"})

    patients: list[dict] = []
    async for link in links:
        patient_doc = await db.users.find_one({"_id": link["patient_id"], "role": "patient"})
        if not patient_doc:
            continue
        patients.append(_public_patient(patient_doc))
    return {"patients": patients}


@router.get("/patients/search")
async def search_patients(
    q: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    query = q.strip().lower()
    if len(query) < 2:
        return {"patients": []}

    links = db.doctor_patient_links.find({"doctor_id": ObjectId(doctor["id"]), "status": "active"})
    linked_ids: set[str] = set()
    async for link in links:
        linked_ids.add(str(link["patient_id"]))

    search_filter = {
        "role": "patient",
        "$or": [
            {"name": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}},
            {"username": {"$regex": query, "$options": "i"}},
        ],
    }

    cursor = db.users.find(search_filter).sort("created_at", -1).limit(10)
    patients: list[dict] = []
    async for doc in cursor:
        serialized = _public_patient(doc)
        serialized["linked"] = serialized["id"] in linked_ids
        patients.append(serialized)

    return {"patients": patients}


@router.get("/patients/assignment-stats")
async def get_patient_assignment_stats(
    q: str | None = None,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    links_cursor = db.doctor_patient_links.find({"doctor_id": ObjectId(doctor["id"]), "status": "active"})
    linked_ids: list[ObjectId] = []
    async for link in links_cursor:
        linked_ids.append(link["patient_id"])

    if not linked_ids:
        return {"stats": []}

    patient_filter: dict = {"_id": {"$in": linked_ids}, "role": "patient"}
    query = (q or "").strip()
    if query:
        patient_filter["$or"] = [
            {"name": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}},
            {"username": {"$regex": query, "$options": "i"}},
        ]

    patient_docs = [doc async for doc in db.users.find(patient_filter)]
    if not patient_docs:
        return {"stats": []}

    patient_map: dict[str, dict] = {}
    patient_ids: list[ObjectId] = []
    for doc in patient_docs:
        public = _public_patient(doc)
        patient_map[public["id"]] = public
        patient_ids.append(doc["_id"])

    counts_map: dict[str, dict[str, int]] = {
        patient_id: {"assigned": 0, "in_progress": 0, "completed": 0, "total": 0}
        for patient_id in patient_map
    }

    counts_cursor = db.exercise_assignments.aggregate(
        [
            {
                "$match": {
                    "doctor_id": ObjectId(doctor["id"]),
                    "patient_id": {"$in": patient_ids},
                }
            },
            {
                "$group": {
                    "_id": {"patient_id": "$patient_id", "status": "$status"},
                    "count": {"$sum": 1},
                }
            },
        ]
    )

    async for row in counts_cursor:
        patient_id_str = str(row["_id"]["patient_id"])
        status = row["_id"].get("status")
        count = int(row.get("count", 0))
        if patient_id_str not in counts_map:
            continue
        counts_map[patient_id_str]["total"] += count
        if status in {"assigned", "in_progress", "completed"}:
            counts_map[patient_id_str][status] += count

    stats: list[PatientAssignmentStats] = []
    for patient_id, public_patient in patient_map.items():
        counts = counts_map[patient_id]
        risk_data = await calculate_patient_risk(db, ObjectId(patient_id))
        stats.append(
            PatientAssignmentStats(
                patient=UserProfile(**public_patient),
                assigned_count=counts["assigned"],
                in_progress_count=counts["in_progress"],
                completed_count=counts["completed"],
                total_count=counts["total"],
                risk_status=risk_data["status"],
                risk_score=risk_data["score"],
            )
        )

    stats.sort(key=lambda item: item.patient.name.lower())
    return {"stats": [item.model_dump() for item in stats]}


@router.get("/patients/{patient_id}/report")
async def get_patient_report(
    patient_id: str,
    exercise_name: str | None = None,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)

    session_filter: dict = {"patient_id": pid, "doctor_id": ObjectId(doctor["id"]), "status": "completed"}
    if exercise_name:
        session_filter["exercise_name"] = exercise_name

    sessions = [serialize_doc(doc) async for doc in db.sessions.find(session_filter).sort("started_at", 1)]
    scores = [float((session.get("summary") or {}).get("avg_final_score", 0.0)) for session in sessions]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    assignment_filter: dict = {"doctor_id": ObjectId(doctor["id"]), "patient_id": pid}
    if exercise_name:
        assignment_filter["exercise_name"] = exercise_name
    total_assignments = await db.exercise_assignments.count_documents(assignment_filter)
    completed_assignments = await db.exercise_assignments.count_documents({**assignment_filter, "status": "completed"})
    adherence = round((completed_assignments / total_assignments) * 100.0, 1) if total_assignments else 0.0

    progression_filter: dict = {"patient_id": pid}
    if exercise_name:
        progression_filter["exercise_name"] = exercise_name
    latest_snapshot = await db.progression_snapshots.find_one(progression_filter, sort=[("snapshot_at", -1)])

    return {
        "patient_id": patient_id,
        "exercise_name": exercise_name,
        "session_count": len(sessions),
        "avg_final_score": avg_score,
        "trend": _trend_label(scores[-5:]),
        "adherence_percent": adherence,
        "recent_scores": scores[-10:],
        "latest_progression": serialize_doc(latest_snapshot),
        "recent_sessions": sessions[-10:],
    }


@router.get("/patients/{patient_id}/sessions")
async def get_patient_sessions(
    patient_id: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)

    sessions = []
    async for doc in db.sessions.find({"patient_id": pid}).sort("started_at", -1).limit(50):
        sessions.append(serialize_doc(doc))
        
    return {"sessions": sessions}

from pydantic import BaseModel
class SessionFeedbackRequest(BaseModel):
    doctor_feedback: str

@router.post("/sessions/{session_id}/feedback")
async def post_session_feedback(
    session_id: str,
    payload: SessionFeedbackRequest,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    sid = to_object_id(session_id, "session_id")
    
    session = await db.sessions.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    await _assert_linked(db, doctor["id"], session["patient_id"])
    
    await db.sessions.update_one(
        {"_id": sid},
        {"$set": {"doctor_feedback": payload.doctor_feedback}}
    )
    return {"status": "success", "message": "Feedback saved successfully"}

@router.post("/patients/{patient_id}/feedback")
async def post_feedback(
    patient_id: str,
    payload: DoctorFeedbackRequest,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)

    doctor_doc = await db.users.find_one({"_id": ObjectId(doctor["id"])})
    doctor_name = doctor_doc.get("name", "Doctor") if doctor_doc else "Doctor"

    feedback_doc = {
        "doctor_id": ObjectId(doctor["id"]),
        "doctor_name": doctor_name,
        "patient_id": pid,
        "message": payload.message,
        "category": payload.category,
        "created_at": utc_now(),
    }
    result = await db.doctor_feedback.insert_one(feedback_doc)
    return {"status": "created", "feedback_id": str(result.inserted_id)}


@router.get("/patients/{patient_id}/feedback")
async def get_feedback(
    patient_id: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)

    cursor = db.doctor_feedback.find({"patient_id": pid}).sort("created_at", -1).limit(50)
    feedback_list = [serialize_doc(doc) async for doc in cursor]
    return {"feedback": feedback_list}


@router.get("/patients/{patient_id}/recommendations")
async def get_patient_recommendations(
    patient_id: str,
    doctor: dict = Depends(require_role({"doctor"})),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    pid = to_object_id(patient_id, "patient_id")
    await _assert_linked(db, doctor["id"], pid)
    
    sessions = [s async for s in db.sessions.find({"patient_id": pid, "status": "completed"}).sort("started_at", -1).limit(5)]
    if not sessions:
        return {"recommendations": []}
        
    avg_score = sum([float((s.get("summary") or {}).get("avg_final_score", 0)) for s in sessions]) / len(sessions)
    
    prompt = f"""
You are an expert physical therapy AI assisting a doctor. Review the patient's recent session data and generate exactly 3 actionable recommendations.
Recent Stats:
- 5-Session Average Score: {round(avg_score, 1)}/100
- Latest Exercise: {sessions[0].get("exercise_name")}

Return the response strictly as a JSON list of 3 objects. Each object must have these keys:
- "title": Short title (e.g., "Increase Intensity", "Monitor Closely", "Patient Education")
- "description": A 1-2 sentence detailed clinical recommendation.
- "category": Either "intensity", "alert", or "behavior"
Example:
[
  {{"title": "Increase Intensity", "description": "Patient is scoring consistently well. Progress to closed-chain exercises.", "category": "intensity"}},
  ...
]
Do not return any markdown formatting, only the JSON array.
"""
    try:
        openai_key = os.getenv("OPENAI_API_KEY")
        res_text = ""
        if openai_key:
            client = openai.AsyncOpenAI(api_key=openai_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=600,
                temperature=0.7
            )
            res_text = response.choices[0].message.content.strip()
        else:
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                client = genai.Client(api_key=gemini_key)
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                )
                res_text = response.text.strip()
                
        res_text = res_text.replace("```json", "").replace("```", "").strip()
        import json
        recommendations = json.loads(res_text)
        return {"recommendations": recommendations}
    except Exception as e:
        print(f"Error generating recommendations: {e}")
        return {"recommendations": []}
