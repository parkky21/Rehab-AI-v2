from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig
from pipeline.feature_engine import calculate_angle_2d


class WallPushups(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 11, 13, 15 | Right: 12, 14, 16
        self.relevant_landmarks = [11, 13, 15, 12, 14, 16]
        self.config = ExerciseConfig(
            target_rom=60.0,
            ideal_rep_time=4.0,
            acceptable_sway=0.015,
            weight_rom=0.45,
            weight_stability=0.25,
            weight_tempo=0.3,
        )
        self.scorer.config = self.config

    def process(self, landmarks):
        left_shoulder = landmarks[11]
        left_elbow = landmarks[13]
        left_wrist = landmarks[15]
        
        right_shoulder = landmarks[12]
        right_elbow = landmarks[14]
        right_wrist = landmarks[16]

        left_angle = calculate_angle_2d(left_shoulder, left_elbow, left_wrist)
        right_angle = calculate_angle_2d(right_shoulder, right_elbow, right_wrist)
        
        avg_angle = (left_angle + right_angle) / 2.0

        self.rom_tracker.update(avg_angle)
        self.record_ml_frame(avg_angle, landmarks)
        self.rep_completed = False

        if left_angle > 150 and right_angle > 150:
            self._on_rep_start()
            self.stage = "up"
            self.feedback = "Lean into wall"
            
        if left_angle < 130 and right_angle < 130 and self.stage == "up":  # Both arms must bend
            self.stage = "down"
            self.counter += 1
            self._on_rep_complete()
            self.feedback = f"Rep done! Score: {self.last_rep_scores['final_score']}"

        return self.counter, self.stage, self.feedback, {"angle": avg_angle, "points": [left_shoulder, left_elbow, left_wrist, right_shoulder, right_elbow, right_wrist]}
