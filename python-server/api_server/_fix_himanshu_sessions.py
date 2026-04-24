"""
Reseed Himanshu Pathak's sessions to align with pain logs
and produce a mathematically justified recovery score.

Recovery formula:
  recovery = user_score * 0.65 + analysis_score * 0.35
  user_score = 100 - (avg_pain_last_3 * 10)
  analysis_score = (avg_rom + avg_tempo) / 2

Pain logs (already seeded, 4 weeks):
  Day 28: 8.0  →  Day 1: 1.2

Session scores we need (improving over 4 weeks):
  Week 1: ROM ~55, Tempo ~58  → analysis ~56.5 | pain ~7.5 → user 25  → recovery ~39
  Week 2: ROM ~68, Tempo ~70  → analysis ~69   | pain ~5.2 → user 48  → recovery ~55
  Week 3: ROM ~78, Tempo ~80  → analysis ~79   | pain ~3.2 → user 68  → recovery ~72
  Week 4: ROM ~88, Tempo ~90  → analysis ~89   | pain ~1.5 → user 85  → recovery ~86
"""

import asyncio
import random
from datetime import timedelta, datetime, UTC
from bson import ObjectId
from api_server.database import mongo
from api_server.utils import utc_now


HIMANSHU_ID = ObjectId("69d7707e67cf7b236ce58d14")
DOCTOR_ID = ObjectId("69ebc2ebd4889464a354bd92")


def _dt(days_ago: int, hour: int = 10) -> datetime:
    base = datetime.now(UTC).replace(hour=hour, minute=0, second=0, microsecond=0)
    return base - timedelta(days=days_ago)


def _make_summary(exercise_name, num_reps, base_rom, base_stab, base_tempo):
    reps = []
    rom_list, stab_list, tempo_list, final_list = [], [], [], []

    for i in range(1, num_reps + 1):
        fatigue = min(2.0, i * 0.2)
        rom = round(min(100, max(0, base_rom - fatigue * 0.3 + random.uniform(-2, 2))), 1)
        stab = round(min(100, max(0, base_stab - fatigue + random.uniform(-2, 2))), 1)
        tempo = round(min(100, max(0, base_tempo - fatigue * 0.2 + random.uniform(-2, 2))), 1)
        final = round(rom * 0.4 + stab * 0.3 + tempo * 0.3, 1)
        reps.append({"rep": i, "rom_score": rom, "stability_score": stab,
                      "tempo_score": tempo, "final_score": final, "feedback": []})
        rom_list.append(rom); stab_list.append(stab)
        tempo_list.append(tempo); final_list.append(final)

    return {
        "exercise": exercise_name,
        "total_reps": num_reps,
        "avg_rom_score": round(sum(rom_list) / len(rom_list), 1),
        "avg_stability_score": round(sum(stab_list) / len(stab_list), 1),
        "avg_tempo_score": round(sum(tempo_list) / len(tempo_list), 1),
        "avg_final_score": round(sum(final_list) / len(final_list), 1),
        "duration_seconds": random.randint(240, 420),
        "reps": reps,
    }


async def main():
    await mongo.connect()
    db = mongo.db

    print("🧹 Clearing old Himanshu Pathak session data...")
    await db.sessions.delete_many({"patient_id": HIMANSHU_ID})
    await db.rep_events.delete_many({"patient_id": HIMANSHU_ID})
    await db.progression_snapshots.delete_many({"patient_id": HIMANSHU_ID})

    # Check assignments — get their IDs
    assignments = {}
    async for a in db.exercise_assignments.find({"patient_id": HIMANSHU_ID}):
        assignments[a["exercise_name"]] = a["_id"]
    print(f"   Found {len(assignments)} assignments: {list(assignments.keys())}")

    # If no assignments, create them
    exercises = ["Squats", "Heel Raises", "Marching"]
    if not assignments:
        print("   Creating assignments...")
        for ex in exercises:
            r = await db.exercise_assignments.insert_one({
                "doctor_id": DOCTOR_ID, "patient_id": HIMANSHU_ID,
                "doctor_name": "Dr Parth Kale", "exercise_name": ex,
                "target_reps": 10, "target_sets": 3,
                "rest_interval_seconds": 60, "protocol": "Post-ACL Phase 2",
                "status": "completed", "notes": f"{ex} rehab",
                "created_at": _dt(28), "updated_at": utc_now(),
            })
            assignments[ex] = r.inserted_id

    # Make sure all are completed
    await db.exercise_assignments.update_many(
        {"patient_id": HIMANSHU_ID},
        {"$set": {"status": "completed", "updated_at": utc_now()}}
    )

    # ── Define 4-week session schedule ───────────────────────────
    # Each tuple: (days_ago, exercise, base_rom, base_stability, base_tempo)
    # Target weekly averages: W1≈56, W2≈64, W3≈67, W4≈69
    schedule = [
        # Week 1 (days 28-22): target final ≈ 56
        (28, "Squats",      40, 35, 40),
        (27, "Heel Raises",  40, 45, 45),


        # Week 2 (days 21-15): target final ≈ 64
        (21, "Squats",      60, 55, 60),
        (20, "Heel Raises",  60, 55, 60),


        # Week 3 (days 14-8): target final ≈ 67
        (14, "Squats",      62, 59, 62),
        (13, "Heel Raises",  62, 59, 62),


        # Week 4 (days 7-1): target final ≈ 69
        (7,  "Squats",      65, 62, 65),
        (6,  "Heel Raises",  69, 67, 69),

    ]

    print(f"\n📊 Seeding {len(schedule)} sessions over 4 weeks...")
    all_scores = []

    for days_ago, exercise, b_rom, b_stab, b_tempo in schedule:
        reps = 10
        summary = _make_summary(exercise, reps, b_rom, b_stab, b_tempo)
        started = _dt(days_ago, hour=random.choice([9, 10, 11, 14, 16]))
        dur = summary["duration_seconds"]

        # Pick assignment ID (fall back to first one if exercise not found)
        aid = assignments.get(exercise, list(assignments.values())[0])

        # Insert session
        result = await db.sessions.insert_one({
            "assignment_id": aid, "doctor_id": DOCTOR_ID,
            "patient_id": HIMANSHU_ID, "exercise_name": exercise,
            "target_reps": reps, "target_sets": 3,
            "rest_interval_seconds": 60, "status": "completed",
            "started_at": started, "ended_at": started + timedelta(seconds=dur),
            "summary": summary,
        })
        session_id = result.inserted_id

        # Insert rep events
        for r in summary["reps"]:
            await db.rep_events.insert_one({
                "session_id": session_id, "patient_id": HIMANSHU_ID,
                "doctor_id": DOCTOR_ID, "exercise_name": exercise,
                "rep_number": r["rep"],
                "scores": {k: r[k] for k in ["rom_score", "stability_score", "tempo_score", "final_score"]},
                "rep_time": round(random.uniform(2.5, 4.5), 2),
                "rom_value": round(random.uniform(60, 120), 1),
                "created_at": started + timedelta(seconds=r["rep"] * 15),
            })

        # Progression snapshot
        all_scores.append(summary["avg_final_score"])
        decision = "progress" if summary["avg_final_score"] >= 85 else ("regress" if summary["avg_final_score"] < 60 else "maintain")
        await db.progression_snapshots.insert_one({
            "patient_id": HIMANSHU_ID, "doctor_id": DOCTOR_ID,
            "exercise_name": exercise, "latest_score": summary["avg_final_score"],
            "recent_scores": all_scores[-5:], "target_reps": 10,
            "target_rom_multiplier": 1.0, "sway_tolerance_multiplier": 1.0,
            "decision": decision, "snapshot_at": started,
        })

        print(f"   Day -{days_ago:2d} | {exercise:14s} | ROM={summary['avg_rom_score']:5.1f} "
              f"Stab={summary['avg_stability_score']:5.1f} Tempo={summary['avg_tempo_score']:5.1f} "
              f"→ Final={summary['avg_final_score']:5.1f}")

    # Clear cached AI insight
    await db.users.update_one({"_id": HIMANSHU_ID}, {"$unset": {"cached_ai_insight": ""}})

    # ── Verify final recovery score math ─────────────────────────
    print("\n" + "=" * 60)
    print("📐 Recovery Score Verification:")

    # Last 3 pain logs
    pains = [p async for p in db.pain_logs.find({"patient_id": HIMANSHU_ID}).sort("created_at", -1).limit(3)]
    avg_pain = sum(p["score"] for p in pains) / len(pains)
    user_score = max(0, 100 - avg_pain * 10)
    print(f"   Last 3 pain scores: {[p['score'] for p in pains]}")
    print(f"   Avg pain: {avg_pain:.1f} → User score: {user_score:.1f}")

    # Last 5 sessions
    sessions = [s async for s in db.sessions.find({"patient_id": HIMANSHU_ID, "status": "completed"}).sort("started_at", -1).limit(5)]
    rom_scores = [float(s["summary"]["avg_rom_score"]) for s in sessions]
    tempo_scores = [float(s["summary"]["avg_tempo_score"]) for s in sessions]
    avg_rom = sum(rom_scores) / len(rom_scores)
    avg_tempo = sum(tempo_scores) / len(tempo_scores)
    analysis = (avg_rom + avg_tempo) / 2
    print(f"   Last 5 ROM: {[round(r,1) for r in rom_scores]} → Avg: {avg_rom:.1f}")
    print(f"   Last 5 Tempo: {[round(t,1) for t in tempo_scores]} → Avg: {avg_tempo:.1f}")
    print(f"   Analysis score: {analysis:.1f}")

    recovery = user_score * 0.65 + analysis * 0.35
    print(f"\n   🎯 Recovery = ({user_score:.1f} × 0.65) + ({analysis:.1f} × 0.35) = {recovery:.1f}")
    print("=" * 60)

    await mongo.close()


if __name__ == "__main__":
    asyncio.run(main())
