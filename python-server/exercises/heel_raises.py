from .base import ExerciseBase
from pipeline.scorer import ExerciseConfig


class HeelRaises(ExerciseBase):
    def __init__(self):
        super().__init__()
        # Left: 27, 31 | Right: 28, 32
        self.relevant_landmarks = [27, 31, 28, 32]
        self.config = ExerciseConfig(
            target_rom=5.0,
            ideal_rep_time=5.0,    # Very controlled tempo for heel raises
            acceptable_sway=0.02,
            tempo_penalty_factor=15.0,
            weight_rom=0.25,
            weight_stability=0.35,
            weight_tempo=0.4,
        )
        self.scorer.config = self.config

    def process(self, landmarks):
        left_ankle = landmarks[27]
        left_toe = landmarks[31]
        
        right_ankle = landmarks[28]
        right_toe = landmarks[32]

        left_vertical_dist = left_toe.y - left_ankle.y
        right_vertical_dist = right_toe.y - right_ankle.y
        
        avg_vertical_dist = (left_vertical_dist + right_vertical_dist) / 2.0
        
        proxy_angle = avg_vertical_dist * 100
        self.rom_tracker.update(proxy_angle)
        self.record_ml_frame(proxy_angle, landmarks)
        self.rep_completed = False

        if left_vertical_dist < 0.02 and right_vertical_dist < 0.02:
            self._on_rep_start()
            self.stage = "down"
            self.feedback = "Raise heels slowly"
            
        elif left_vertical_dist > 0.03 and right_vertical_dist > 0.03 and self.stage == "down":  # Both heels must lift
            self.stage = "up"
            self.counter += 1
            self._on_rep_complete()
            self.feedback = f"Rep done! Score: {self.last_rep_scores['final_score']}"

        return self.counter, self.stage, self.feedback, {"angle": 0, "points": [left_ankle, left_toe, right_ankle, right_toe]}
