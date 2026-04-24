from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig
from pipeline.feature_engine import calculate_angle_2d


class LegRaises(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 11, 23, 25 | Right: 12, 24, 26
        self.relevant_landmarks = [11, 23, 25, 12, 24, 26]
        self.config = ExerciseConfig(
            target_rom=50.0,
            ideal_rep_time=4.0,
            acceptable_sway=0.02,
            weight_rom=0.45,
            weight_stability=0.3,
            weight_tempo=0.25,
        )
        self.scorer.config = self.config
        self.last_active_side = None

    def process(self, landmarks):
        left_shoulder = landmarks[11]
        left_hip = landmarks[23]
        left_knee = landmarks[25]
        
        right_shoulder = landmarks[12]
        right_hip = landmarks[24]
        right_knee = landmarks[26]

        left_angle = calculate_angle_2d(left_shoulder, left_hip, left_knee)
        right_angle = calculate_angle_2d(right_shoulder, right_hip, right_knee)
        
        # Track the active side's angle for scoring
        active_angle = left_angle if self.last_active_side == "left" else right_angle
        if self.stage == "down" or self.stage == "up": # If a side is active, report its angle
             pass
        else:
             active_angle = (left_angle + right_angle) / 2.0  # fallback
             
        self.rom_tracker.update(active_angle)
        self.record_ml_frame(active_angle, landmarks)
        self.rep_completed = False

        if left_angle > 160 and right_angle > 160:
            self._on_rep_start()
            self.stage = "down"
            self.feedback = "Raise alternating leg"
            
        elif left_angle < 150 and right_angle >= 150 and self.stage == "down":
            if self.last_active_side != "left":
                self.stage = "up"
                self.counter += 1
                self.last_active_side = "left"
                self._on_rep_complete()
                self.feedback = f"Left rep done! Score: {self.last_rep_scores['final_score']}"
            else:
                self.feedback = "Use right leg for next rep"

        elif right_angle < 150 and left_angle >= 150 and self.stage == "down":
            if self.last_active_side != "right":
                self.stage = "up"
                self.counter += 1
                self.last_active_side = "right"
                self._on_rep_complete()
                self.feedback = f"Right rep done! Score: {self.last_rep_scores['final_score']}"
            else:
                self.feedback = "Use left leg for next rep"

        return self.counter, self.stage, self.feedback, {"angle": active_angle, "points": [left_shoulder, left_hip, left_knee, right_shoulder, right_hip, right_knee]}
