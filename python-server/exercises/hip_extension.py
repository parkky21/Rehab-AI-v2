from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig
from pipeline.feature_engine import calculate_angle_2d


class StandingHipExtension(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 11, 23, 27 | Right: 12, 24, 28
        self.relevant_landmarks = [11, 23, 27, 12, 24, 28]
        self.config = ExerciseConfig(
            target_rom=25.0,
            ideal_rep_time=4.0,
            acceptable_sway=0.025,
            weight_rom=0.35,
            weight_stability=0.4,
            weight_tempo=0.25,
        )
        self.scorer.config = self.config
        self.last_active_side = None

    def process(self, landmarks):
        left_shoulder = landmarks[11]
        left_hip = landmarks[23]
        left_ankle = landmarks[27]
        
        right_shoulder = landmarks[12]
        right_hip = landmarks[24]
        right_ankle = landmarks[28]

        left_angle = calculate_angle_2d(left_shoulder, left_hip, left_ankle)
        right_angle = calculate_angle_2d(right_shoulder, right_hip, right_ankle)
        
        active_angle = left_angle if self.last_active_side == "left" else right_angle
        if self.stage == "down" or self.stage == "up":
             pass
        else:
             active_angle = (left_angle + right_angle) / 2.0

        self.rom_tracker.update(active_angle)
        self.record_ml_frame(active_angle, landmarks)
        self.rep_completed = False

        if left_angle > 170 and right_angle > 170:
            self._on_rep_start()
            self.stage = "down"
            self.feedback = "Kick alternating leg backward"
            
        elif left_angle < 165 and right_angle >= 165 and self.stage == "down":
            if self.last_active_side != "left":
                self.stage = "up"
                self.counter += 1
                self.last_active_side = "left"
                self._on_rep_complete()
                self.feedback = f"Left rep done! Score: {self.last_rep_scores['final_score']}"
            else:
                self.feedback = "Use right leg to alternate"

        elif right_angle < 165 and left_angle >= 165 and self.stage == "down":
            if self.last_active_side != "right":
                self.stage = "up"
                self.counter += 1
                self.last_active_side = "right"
                self._on_rep_complete()
                self.feedback = f"Right rep done! Score: {self.last_rep_scores['final_score']}"
            else:
                self.feedback = "Use left leg to alternate"

        return self.counter, self.stage, self.feedback, {"angle": active_angle, "points": [left_shoulder, left_hip, left_ankle, right_shoulder, right_hip, right_ankle]}
