"""
Seed script for the presentation demo.
- Doctor: Parth Kale
- 3 patients linked to the doctor
- Himanshu gets rich 3-week data with improving trends
- Other 2 patients get completed assignments with decent data
- All assignments marked completed
- Pain logs, sessions, rep events, progression snapshots, doctor feedback
"""

import asyncio
import random
from datetime import timedelta, datetime, UTC

from bson import ObjectId

from api_server.database import mongo
from api_server.security import hash_password
from api_server.utils import utc_now


# ─── Helpers ────────────────────────────────────────────────────
def _dt(days_ago: int, hour: int = 10, minute: int = 0) -> datetime:
    """Return a UTC datetime `days_ago` days in the past."""
    base = datetime.now(UTC).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return base - timedelta(days=days_ago)


def _make_rep_scores(
    base_rom: float,
    base_stability: float,
    base_tempo: float,
    variance: float = 5.0,
) -> dict:
    rom = round(min(100, max(0, base_rom + random.uniform(-variance, variance))), 1)
    stab = round(min(100, max(0, base_stability + random.uniform(-variance, variance))), 1)
    tempo = round(min(100, max(0, base_tempo + random.uniform(-variance, variance))), 1)
    final = round((rom * 0.4 + stab * 0.3 + tempo * 0.3), 1)
    return {
        "rom_score": rom,
        "stability_score": stab,
        "tempo_score": tempo,
        "final_score": final,
    }


def _make_session_summary(
    exercise_name: str,
    num_reps: int,
    base_rom: float,
    base_stability: float,
    base_tempo: float,
    duration_seconds: int = 300,
) -> dict:
    reps = []
    rom_scores = []
    stab_scores = []
    tempo_scores = []
    final_scores = []

    for i in range(1, num_reps + 1):
        # Slight fatigue: later reps are slightly worse
        fatigue = min(3.0, i * 0.3)
        scores = _make_rep_scores(
            base_rom - fatigue * 0.5,
            base_stability - fatigue,
            base_tempo - fatigue * 0.3,
            variance=4.0,
        )
        reps.append({
            "rep": i,
            **scores,
            "feedback": [],
        })
        rom_scores.append(scores["rom_score"])
        stab_scores.append(scores["stability_score"])
        tempo_scores.append(scores["tempo_score"])
        final_scores.append(scores["final_score"])

    return {
        "exercise": exercise_name,
        "total_reps": num_reps,
        "avg_rom_score": round(sum(rom_scores) / len(rom_scores), 1),
        "avg_stability_score": round(sum(stab_scores) / len(stab_scores), 1),
        "avg_tempo_score": round(sum(tempo_scores) / len(tempo_scores), 1),
        "avg_final_score": round(sum(final_scores) / len(final_scores), 1),
        "duration_seconds": duration_seconds,
        "reps": reps,
    }


async def _upsert_user(db, name, email, username, password, role) -> ObjectId:
    """Upsert a user and return their ObjectId."""
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "name": name,
                "username": username,
                "password_hash": hash_password(password),
                "role": role,
            }}
        )
        return existing["_id"]
    else:
        result = await db.users.insert_one({
            "name": name,
            "email": email,
            "username": username,
            "password_hash": hash_password(password),
            "role": role,
            "created_at": _dt(25),
        })
        return result.inserted_id


async def _link_patient(db, doctor_id: ObjectId, patient_id: ObjectId):
    await db.doctor_patient_links.update_one(
        {"doctor_id": doctor_id, "patient_id": patient_id},
        {"$setOnInsert": {
            "doctor_id": doctor_id,
            "patient_id": patient_id,
            "status": "active",
            "created_at": _dt(21),
        }},
        upsert=True,
    )


async def _create_assignment(
    db, doctor_id, patient_id, exercise_name, target_reps, target_sets,
    status="completed", notes=None, days_ago=21, protocol=None,
) -> ObjectId:
    doc = {
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "doctor_name": "Dr. Parth Kale",
        "exercise_name": exercise_name,
        "target_reps": target_reps,
        "target_sets": target_sets,
        "rest_interval_seconds": 60,
        "protocol": protocol or "Post-ACL Phase 2",
        "status": status,
        "notes": notes or f"{exercise_name} rehab protocol",
        "created_at": _dt(days_ago),
        "updated_at": utc_now(),
    }
    result = await db.exercise_assignments.insert_one(doc)
    return result.inserted_id


async def _create_session(
    db, assignment_id, doctor_id, patient_id, exercise_name,
    target_reps, target_sets, summary, started_at, duration_seconds=300,
) -> ObjectId:
    doc = {
        "assignment_id": assignment_id,
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "exercise_name": exercise_name,
        "target_reps": target_reps,
        "target_sets": target_sets,
        "rest_interval_seconds": 60,
        "status": "completed",
        "started_at": started_at,
        "ended_at": started_at + timedelta(seconds=duration_seconds),
        "summary": summary,
    }
    result = await db.sessions.insert_one(doc)
    return result.inserted_id


async def _create_rep_events(
    db, session_id, patient_id, doctor_id, exercise_name, summary, started_at,
):
    reps = summary.get("reps", [])
    for r in reps:
        await db.rep_events.insert_one({
            "session_id": session_id,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "exercise_name": exercise_name,
            "rep_number": r["rep"],
            "scores": {
                "rom_score": r["rom_score"],
                "stability_score": r["stability_score"],
                "tempo_score": r["tempo_score"],
                "final_score": r["final_score"],
            },
            "rep_time": round(random.uniform(2.5, 4.5), 2),
            "rom_value": round(random.uniform(60, 120), 1),
            "created_at": started_at + timedelta(seconds=r["rep"] * 15),
        })


async def _create_progression_snapshot(
    db, patient_id, doctor_id, exercise_name, score, recent_scores, snapshot_at,
):
    decision = "maintain"
    if score >= 85:
        decision = "progress"
    elif score < 60:
        decision = "regress"

    await db.progression_snapshots.insert_one({
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "exercise_name": exercise_name,
        "latest_score": score,
        "recent_scores": recent_scores,
        "target_reps": 10,
        "target_rom_multiplier": 1.0,
        "sway_tolerance_multiplier": 1.0,
        "decision": decision,
        "snapshot_at": snapshot_at,
    })


# ─── Main Seed ──────────────────────────────────────────────────
async def seed() -> None:
    await mongo.connect()
    db = mongo.db
    if db is None:
        raise RuntimeError("MongoDB not connected")

    print("🧹 Cleaning old seeded demo data...")
    # We won't drop the whole DB — just remove data created by this script
    # by targeting known emails. This makes it safe to re-run.

    demo_emails = [
        "parth@rehabai.local",
        "himanshu@rehabai.local",
        "sneha.verma@rehabai.local",
        "arjun.nair@rehabai.local",
    ]
    demo_users = [u async for u in db.users.find({"email": {"$in": demo_emails}})]
    demo_ids = [u["_id"] for u in demo_users]

    if demo_ids:
        await db.doctor_patient_links.delete_many({"$or": [
            {"doctor_id": {"$in": demo_ids}},
            {"patient_id": {"$in": demo_ids}},
        ]})
        await db.exercise_assignments.delete_many({"$or": [
            {"doctor_id": {"$in": demo_ids}},
            {"patient_id": {"$in": demo_ids}},
        ]})
        await db.sessions.delete_many({"$or": [
            {"doctor_id": {"$in": demo_ids}},
            {"patient_id": {"$in": demo_ids}},
        ]})
        await db.rep_events.delete_many({"$or": [
            {"doctor_id": {"$in": demo_ids}},
            {"patient_id": {"$in": demo_ids}},
        ]})
        await db.progression_snapshots.delete_many({"$or": [
            {"doctor_id": {"$in": demo_ids}},
            {"patient_id": {"$in": demo_ids}},
        ]})
        await db.pain_logs.delete_many({"patient_id": {"$in": demo_ids}})
        await db.doctor_feedback.delete_many({"$or": [
            {"doctor_id": {"$in": demo_ids}},
            {"patient_id": {"$in": demo_ids}},
        ]})
        await db.clinical_roadmaps.delete_many({"patient_id": {"$in": demo_ids}})

    # ── 1. Find existing doctor or create ────────────────────────
    print("👤 Looking up doctor: Parth Kale...")
    # Use the real doctor account (parkky@rehab.ai) if it exists
    real_doctor = await db.users.find_one({"email": "parkky@rehab.ai", "role": "doctor"})
    if real_doctor:
        doctor_id = real_doctor["_id"]
        print(f"   Found existing doctor: {real_doctor['name']} ({real_doctor['email']})")
    else:
        doctor_id = await _upsert_user(
            db, "Dr. Parth Kale", "parth@rehabai.local", "parth_kale", "Doctor@123", "doctor"
        )
        print("   Created new doctor account: parth@rehabai.local")

    print("👤 Creating patients...")
    himanshu_id = await _upsert_user(
        db, "Himanshu Sharma", "himanshu@rehabai.local", "himanshu", "12345678", "patient"
    )
    sneha_id = await _upsert_user(
        db, "Sneha Verma", "sneha.verma@rehabai.local", "sneha_v", "12345678", "patient"
    )
    arjun_id = await _upsert_user(
        db, "Arjun Nair", "arjun.nair@rehabai.local", "arjun_n", "12345678", "patient"
    )

    # ── 2. Link patients to doctor ───────────────────────────────
    print("🔗 Linking patients to doctor...")
    await _link_patient(db, doctor_id, himanshu_id)
    await _link_patient(db, doctor_id, sneha_id)
    await _link_patient(db, doctor_id, arjun_id)

    # ── 3. Exercises to assign ───────────────────────────────────
    exercises_config = [
        {"name": "Squats", "reps": 10, "sets": 3},
        {"name": "Heel Raises", "reps": 12, "sets": 3},
        {"name": "Marching", "reps": 14, "sets": 2},
        {"name": "Leg Raises", "reps": 10, "sets": 3},
        {"name": "Sit-to-Stand", "reps": 8, "sets": 3},
    ]

    # ══════════════════════════════════════════════════════════════
    #   HIMANSHU — Rich 3-week data with improving trends
    # ══════════════════════════════════════════════════════════════
    print("📊 Seeding Himanshu's 3-week journey...")

    # Assign all exercises to Himanshu (all completed)
    himanshu_assignments = {}
    for ex in exercises_config:
        aid = await _create_assignment(
            db, doctor_id, himanshu_id, ex["name"],
            ex["reps"], ex["sets"],
            status="completed", days_ago=21,
            protocol="Post-ACL Phase 2",
        )
        himanshu_assignments[ex["name"]] = aid

    # ── 3 weeks of sessions: scores improve over time ────────────
    # Week 1 (days 21-15): Base scores around 55-65
    # Week 2 (days 14-8):  Scores improve to 68-78
    # Week 3 (days 7-1):   Scores reach 80-92

    week_profiles = [
        # (days_range, base_rom, base_stability, base_tempo)
        (range(21, 14, -1), 58, 55, 60),   # Week 1: rebuilding
        (range(14, 7, -1),  72, 70, 73),    # Week 2: strong progress
        (range(7, 0, -1),   85, 82, 86),    # Week 3: excellent form
    ]

    himanshu_all_scores = []

    for days_range, base_rom, base_stab, base_tempo in week_profiles:
        for day_offset in days_range:
            # Pick 1-2 exercises per day randomly
            day_exercises = random.sample(exercises_config, k=min(2, len(exercises_config)))
            for ex in day_exercises:
                # Add some day-to-day variation
                day_var = random.uniform(-3, 5)
                summary = _make_session_summary(
                    ex["name"], ex["reps"],
                    base_rom + day_var,
                    base_stab + day_var,
                    base_tempo + day_var,
                    duration_seconds=random.randint(240, 420),
                )
                started = _dt(day_offset, hour=random.choice([9, 10, 11, 14, 16]))

                session_id = await _create_session(
                    db, himanshu_assignments[ex["name"]],
                    doctor_id, himanshu_id, ex["name"],
                    ex["reps"], ex["sets"], summary, started,
                    duration_seconds=summary["duration_seconds"],
                )

                # Rep events for session
                await _create_rep_events(
                    db, session_id, himanshu_id, doctor_id, ex["name"], summary, started,
                )

                # Progression snapshot
                himanshu_all_scores.append(summary["avg_final_score"])
                recent_5 = himanshu_all_scores[-5:]
                await _create_progression_snapshot(
                    db, himanshu_id, doctor_id, ex["name"],
                    summary["avg_final_score"], recent_5, started,
                )

    # ── Pain logs: decreasing over 3 weeks ───────────────────────
    print("🩹 Seeding Himanshu's pain logs (decreasing trend)...")
    pain_schedule = [
        # (days_ago, pain_score)
        (21, 7.5), (20, 7.0), (19, 6.8),
        (18, 6.5), (17, 6.2), (16, 6.0),
        (15, 5.5), (14, 5.2), (13, 5.0),
        (12, 4.8), (11, 4.5), (10, 4.2),
        (9, 3.8),  (8, 3.5),  (7, 3.2),
        (6, 3.0),  (5, 2.8),  (4, 2.5),
        (3, 2.2),  (2, 2.0),  (1, 1.8),
    ]
    for days_ago, pain_score in pain_schedule:
        await db.pain_logs.insert_one({
            "patient_id": himanshu_id,
            "score": pain_score,
            "location": "knee" if pain_score > 4 else "general",
            "notes": None,
            "validation_note": None,
            "created_at": _dt(days_ago, hour=20),
        })

    # ── Doctor feedback for Himanshu ─────────────────────────────
    print("💬 Seeding doctor feedback for Himanshu...")
    feedback_entries = [
        (18, "encouragement", "Great start to your rehab journey, Himanshu! Your dedication in the first week is exactly what we need. Keep showing up consistently."),
        (14, "correction", "Your squat form needs attention — focus on keeping your knees aligned over your toes. Try slowing down the descent phase."),
        (10, "encouragement", "Excellent progress this week! Your ROM has improved noticeably. The consistency is paying off."),
        (7, "goal", "Let's aim for 85+ scores across all exercises by end of this week. You're very close — focus on stability during heel raises."),
        (4, "encouragement", "Outstanding improvement, Himanshu! Your scores have jumped from the 60s to the 80s in just 2 weeks. Very proud of your commitment."),
        (1, "goal", "Next phase: we'll be progressing to more challenging exercises. Your recovery is ahead of schedule. Keep up the fantastic work!"),
    ]
    for days_ago, category, message in feedback_entries:
        await db.doctor_feedback.insert_one({
            "doctor_id": doctor_id,
            "doctor_name": "Dr. Parth Kale",
            "patient_id": himanshu_id,
            "message": message,
            "category": category,
            "created_at": _dt(days_ago, hour=15),
        })

    # ── Clinical roadmap for Himanshu ────────────────────────────
    print("🗺️  Seeding clinical roadmap for Himanshu...")
    await db.clinical_roadmaps.delete_many({"patient_id": himanshu_id})
    await db.clinical_roadmaps.insert_one({
        "patient_id": himanshu_id,
        "doctor_id": doctor_id,
        "protocol": "Post-ACL Phase 2",
        "milestones": [
            {"title": "Phase 1: Protection & Mobility", "description": "Reduce swelling, restore basic range of motion with gentle exercises.", "target_week": 1, "status": "done"},
            {"title": "Phase 2: Strengthening", "description": "Build quadriceps and hamstring strength with controlled resistance.", "target_week": 3, "status": "active"},
            {"title": "Phase 3: Functional Training", "description": "Integrate balance and proprioception exercises for daily activities.", "target_week": 5, "status": "pending"},
            {"title": "Phase 4: Return to Activity", "description": "Sport-specific drills and clearance testing.", "target_week": 8, "status": "pending"},
        ],
        "created_at": _dt(21),
        "updated_at": utc_now(),
    })

    # ══════════════════════════════════════════════════════════════
    #   SNEHA VERMA — Good patient, completed exercises
    # ══════════════════════════════════════════════════════════════
    print("📊 Seeding Sneha Verma's data...")

    sneha_exercises = exercises_config[:3]  # Squats, Heel Raises, Marching
    sneha_assignments = {}
    for ex in sneha_exercises:
        aid = await _create_assignment(
            db, doctor_id, sneha_id, ex["name"],
            ex["reps"], ex["sets"],
            status="completed", days_ago=14,
            protocol="Post-ACL Phase 2",
        )
        sneha_assignments[ex["name"]] = aid

    # 2 weeks of sessions with moderate-good scores
    for day_offset in range(14, 0, -1):
        ex = random.choice(sneha_exercises)
        base = random.uniform(68, 78)
        summary = _make_session_summary(
            ex["name"], ex["reps"], base, base - 2, base + 1,
            duration_seconds=random.randint(250, 380),
        )
        started = _dt(day_offset, hour=random.choice([9, 11, 15]))
        session_id = await _create_session(
            db, sneha_assignments[ex["name"]],
            doctor_id, sneha_id, ex["name"],
            ex["reps"], ex["sets"], summary, started,
        )
        await _create_rep_events(db, session_id, sneha_id, doctor_id, ex["name"], summary, started)

    # Pain logs for Sneha
    for days_ago in range(14, 0, -1):
        pain = round(random.uniform(2.0, 4.5), 1)
        await db.pain_logs.insert_one({
            "patient_id": sneha_id,
            "score": pain,
            "location": "general",
            "notes": None,
            "validation_note": None,
            "created_at": _dt(days_ago, hour=19),
        })

    # ══════════════════════════════════════════════════════════════
    #   ARJUN NAIR — Completed, slightly lower scores (watchlist)
    # ══════════════════════════════════════════════════════════════
    print("📊 Seeding Arjun Nair's data...")

    arjun_exercises = exercises_config[:3]
    arjun_assignments = {}
    for ex in arjun_exercises:
        aid = await _create_assignment(
            db, doctor_id, arjun_id, ex["name"],
            ex["reps"], ex["sets"],
            status="completed", days_ago=14,
            protocol="Post-ACL Phase 2",
        )
        arjun_assignments[ex["name"]] = aid

    for day_offset in range(14, 0, -1):
        ex = random.choice(arjun_exercises)
        base = random.uniform(55, 68)
        summary = _make_session_summary(
            ex["name"], ex["reps"], base, base - 3, base - 1,
            duration_seconds=random.randint(280, 400),
        )
        started = _dt(day_offset, hour=random.choice([10, 14, 17]))
        session_id = await _create_session(
            db, arjun_assignments[ex["name"]],
            doctor_id, arjun_id, ex["name"],
            ex["reps"], ex["sets"], summary, started,
        )
        await _create_rep_events(db, session_id, arjun_id, doctor_id, ex["name"], summary, started)

    # Pain logs for Arjun (moderate, fluctuating)
    for days_ago in range(14, 0, -1):
        pain = round(random.uniform(4.0, 6.5), 1)
        await db.pain_logs.insert_one({
            "patient_id": arjun_id,
            "score": pain,
            "location": "knee",
            "notes": None,
            "validation_note": None,
            "created_at": _dt(days_ago, hour=21),
        })

    # ── Summary ──────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("✅ SEED COMPLETE — Presentation data ready!")
    print("=" * 60)
    print(f"\n🩺 Doctor Login:")
    print(f"   Email:    parth@rehabai.local")
    print(f"   Password: Doctor@123")
    print(f"\n👤 Patient Login (Himanshu):")
    print(f"   Email:    himanshu@rehabai.local")
    print(f"   Password: 12345678")
    print(f"\n👤 Patient Login (Sneha):")
    print(f"   Email:    sneha.verma@rehabai.local")
    print(f"   Password: 12345678")
    print(f"\n👤 Patient Login (Arjun):")
    print(f"   Email:    arjun.nair@rehabai.local")
    print(f"   Password: 12345678")
    print("=" * 60)

    await mongo.close()


if __name__ == "__main__":
    asyncio.run(seed())
