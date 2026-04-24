from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig
from pipeline.feature_engine import calculate_angle_2d


class Squats(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 23, 25, 27 | Right: 24, 26, 28
        self.relevant_landmarks = [23, 25, 27, 24, 26, 28]
        self.config = ExerciseConfig(
            target_rom=70.0,       # ~160 - ~90 = 70 degrees knee ROM
            ideal_rep_time=4.0,    # 4 seconds per rep for rehab
            acceptable_sway=0.015,
            weight_rom=0.4,
            weight_stability=0.35,
            weight_tempo=0.25,
        )
        self.scorer.config = self.config

    def process(self, landmarks):
        left_hip = landmarks[23]
        left_knee = landmarks[25]
        left_ankle = landmarks[27]
        
        right_hip = landmarks[24]
        right_knee = landmarks[26]
        right_ankle = landmarks[28]

        left_angle = calculate_angle_2d(left_hip, left_knee, left_ankle)
        right_angle = calculate_angle_2d(right_hip, right_knee, right_ankle)
        
        avg_angle = (left_angle + right_angle) / 2.0

        self.rom_tracker.update(avg_angle)
        self.record_ml_frame(avg_angle, landmarks)
        self.rep_completed = False

        if left_angle > 160 and right_angle > 160:
            self._on_rep_start()
            self.stage = "up"
            self.feedback = "Squat down"
            
        if left_angle < 140 and right_angle < 140 and self.stage == "up":  # Both knees must bend
            self.stage = "down"
            self.counter += 1
            self._on_rep_complete()
            self.feedback = f"Rep done! Score: {self.last_rep_scores['final_score']}"

        return self.counter, self.stage, self.feedback, {"angle": avg_angle, "points": [left_hip, left_knee, left_ankle, right_hip, right_knee, right_ankle]}
