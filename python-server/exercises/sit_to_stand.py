from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig


class SitToStand(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 23, 25 | Right: 24, 26
        self.relevant_landmarks = [23, 25, 24, 26]
        self.config = ExerciseConfig(
            target_rom=50.0,
            ideal_rep_time=5.0,    # Slow, controlled sit-to-stand
            acceptable_sway=0.02,
            weight_rom=0.3,
            weight_stability=0.4,
            weight_tempo=0.3,
        )
        self.scorer.config = self.config

    def process(self, landmarks):
        left_hip = landmarks[23]
        left_knee = landmarks[25]
        
        right_hip = landmarks[24]
        right_knee = landmarks[26]

        left_vertical_dist = left_knee.y - left_hip.y
        right_vertical_dist = right_knee.y - right_hip.y
        
        avg_vertical_dist = (left_vertical_dist + right_vertical_dist) / 2.0
        
        proxy_angle = avg_vertical_dist * 100
        self.rom_tracker.update(proxy_angle)
        self.record_ml_frame(proxy_angle, landmarks)
        self.rep_completed = False

        if left_vertical_dist < 0.1 and right_vertical_dist < 0.1:
            self._on_rep_start()
            self.stage = "seated"
            self.feedback = "Stand up"
            
        elif left_vertical_dist > 0.15 and right_vertical_dist > 0.15 and self.stage == "seated":  # Both sides must stand
            self.stage = "standing"
            self.counter += 1
            self._on_rep_complete()
            self.feedback = f"Rep done! Score: {self.last_rep_scores['final_score']}"

        points = [left_hip, left_knee, right_hip, right_knee]
        return self.counter, self.stage, self.feedback, {"angle": 0, "points": points}
