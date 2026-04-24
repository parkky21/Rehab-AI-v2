from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig
from pipeline.feature_engine import calculate_angle_2d


class ForwardArmRaises(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 23, 11, 13 | Right: 24, 12, 14
        self.relevant_landmarks = [23, 11, 13, 24, 12, 14]
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
        left_hip = landmarks[23]
        left_shoulder = landmarks[11]
        left_elbow = landmarks[13]
        
        right_hip = landmarks[24]
        right_shoulder = landmarks[12]
        right_elbow = landmarks[14]

        left_angle = calculate_angle_2d(left_hip, left_shoulder, left_elbow)
        right_angle = calculate_angle_2d(right_hip, right_shoulder, right_elbow)
        
        avg_angle = (left_angle + right_angle) / 2.0

        self.rom_tracker.update(avg_angle)
        self.record_ml_frame(avg_angle, landmarks)
        self.rep_completed = False

        if left_angle < 30 and right_angle < 30:
            self._on_rep_start()
            self.stage = "down"
            self.feedback = "Raise arms forward"
            
        if left_angle > 45 and right_angle > 45 and self.stage == "down":  # Both arms must be raised
            self.stage = "up"
            self.counter += 1
            self._on_rep_complete()
            self.feedback = f"Rep done! Score: {self.last_rep_scores['final_score']}"

        return self.counter, self.stage, self.feedback, {"angle": avg_angle, "points": [left_hip, left_shoulder, left_elbow, right_hip, right_shoulder, right_elbow]}
