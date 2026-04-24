from dataclasses import dataclass

from api_server.exercise_factory import create_exercise_instance
from pipeline import (
    EMALandmarkSmoother,
    Session,
    SwayTracker,
    create_default_feedback_engine,
    process_landmarks,
)
from pipeline.feature_engine import calculate_angle_3d


@dataclass
class RuntimeLandmark:
    x: float
    y: float
    z: float
    visibility: float = 1.0


class RealtimeSessionRuntime:
    def __init__(self, exercise_name: str) -> None:
        self.exercise_name = exercise_name
        self.exercise = create_exercise_instance(exercise_name)
        self.smoother = EMALandmarkSmoother(alpha=0.3)
        self.sway_tracker = SwayTracker(window_size=30)
        self.feedback_engine = create_default_feedback_engine()
        self.session = Session(exercise_name=exercise_name)

    def process_frame(self, landmarks_payload: list[dict]) -> dict:
        if len(landmarks_payload) < 33:
            raise ValueError("Expected 33 landmarks from MediaPipe pose")

        landmarks = [RuntimeLandmark(**lm) for lm in landmarks_payload[:33]]
        smoothed = self.smoother.smooth(landmarks)
        processed, hip_center, _ = process_landmarks(smoothed)
        sway = self.sway_tracker.update(float(hip_center[0]))

        counter, stage, feedback, _ = self.exercise.process(processed)

        rep_event = None
        if self.exercise.rep_completed and self.exercise.last_rep_scores:
            rep_scores = dict(self.exercise.last_rep_scores)
            rep_time = float(rep_scores.get("rep_time", 0.0))
            rom_value = float(rep_scores.get("rom_value", 0.0))
            self.session.add_rep(rep_scores, rom_value=rom_value, rep_time=rep_time)
            rep_event = {
                "rep_number": counter,
                "scores": rep_scores,
                "rep_time": round(rep_time, 3),
                "rom_value": round(rom_value, 2),
                "session_avg": round(self.session.avg_final_score, 1),
            }
            self.exercise.rep_completed = False

        current_rom = 0.0
        if self.exercise.rom_tracker.current_max > float("-inf") and self.exercise.rom_tracker.current_min < float("inf"):
            current_rom = max(0.0, self.exercise.rom_tracker.current_max - self.exercise.rom_tracker.current_min)

        context = {
            "current_rom": current_rom,
            "target_rom": self.exercise.config.target_rom,
            "ideal_rep_time": self.exercise.config.ideal_rep_time,
            "sway": sway,
            "asymmetry_value": 0.0,
        }
        feedback_messages = self.feedback_engine.evaluate(processed, context)
        
        joint_angles = {}
        try:
            # 23=L_HIP, 25=L_KNEE, 27=L_ANKLE
            l_knee = calculate_angle_3d(smoothed[23], smoothed[25], smoothed[27])
            r_knee = calculate_angle_3d(smoothed[24], smoothed[26], smoothed[28])
            # 11=L_SHOULDER, 23=L_HIP, 25=L_KNEE
            l_hip = calculate_angle_3d(smoothed[11], smoothed[23], smoothed[25])
            r_hip = calculate_angle_3d(smoothed[12], smoothed[24], smoothed[26])
            
            joint_angles = {
                "Left Knee": round(l_knee, 1),
                "Right Knee": round(r_knee, 1),
                "Hip Flexion": round((l_hip + r_hip) / 2, 1)
            }
        except Exception:
            pass

        return {
            "counter": counter,
            "stage": stage,
            "feedback": feedback,
            "feedback_rules": feedback_messages,
            "sway": round(sway, 5),
            "rep_event": rep_event,
            "joint_angles": joint_angles,
        }

    def finalize(self) -> dict:
        self.session.end_session()
        return self.session.summary()
