from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig
from pipeline.feature_engine import calculate_angle_2d


class SideArmRaises(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 23, 11, 15 | Right: 24, 12, 16
        self.relevant_landmarks = [23, 11, 15, 24, 12, 16]
        self.config = ExerciseConfig(
            target_rom=55.0,
            ideal_rep_time=4.0,
            acceptable_sway=0.015,
            weight_rom=0.45,
            weight_stability=0.25,
            weight_tempo=0.3,
        )
        self.scorer.config = self.config

    def process(self, landmarks):
        left_hip = landmarks[23]
        left_shoulder = landmarks[11]
        left_wrist = landmarks[15]
        
        right_hip = landmarks[24]
        right_shoulder = landmarks[12]
        right_wrist = landmarks[16]

        left_angle = calculate_angle_2d(left_hip, left_shoulder, left_wrist)
        right_angle = calculate_angle_2d(right_hip, right_shoulder, right_wrist)
        
        avg_angle = (left_angle + right_angle) / 2.0

        self.rom_tracker.update(avg_angle)
        self.record_ml_frame(avg_angle, landmarks)
        self.rep_completed = False

        if left_angle < 35 and right_angle < 35:
            self._on_rep_start()
            self.stage = "down"
            self.feedback = "Raise arms to side"
            
        if left_angle > 50 and right_angle > 50 and self.stage == "down":  # Both arms must be raised
            self.stage = "up"
            self.counter += 1
            self._on_rep_complete()
            self.feedback = f"Rep done! Score: {self.last_rep_scores['final_score']}"

        return self.counter, self.stage, self.feedback, {"angle": avg_angle, "points": [left_hip, left_shoulder, left_wrist, right_hip, right_shoulder, right_wrist]}
