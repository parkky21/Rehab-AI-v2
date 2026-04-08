# REHAB AI: Movement Intelligence & Tele-Rehabilitation
## Project Black Book — Technical Documentation
### Final Year Engineering Project

---

## 1. Project Abstract
Rehab AI is an intelligent tele-rehabilitation system designed to digitize physical therapy. The core innovation lies in its ability to perform real-time biomechanical analysis using standard consumer-grade cameras. By combining computer vision (MediaPipe) with deep sequence modelling (LSTM/Transformers), the system provides clinical-grade feedback to patients while offering longitudinal data analytics to healthcare practitioners.

---

## 2. System Architecture
The platform follows a distributed micro-services architecture for scalability and reliability.

### 2.1 Backend (Python Server)
- **Framework**: FastAPI (Asynchronous Python)
- **Real-time Protocol**: WebSockets for low-latency landmark streaming.
- **Database**: MongoDB (NoSQL) for flexible session JSON storage and user metadata.
- **ML Engine**: PyTorch-based inference for rep scoring.

### 2.2 Frontend (Web Client)
- **Framework**: React 18 + TypeScript + Vite.
- **Vision Engine**: MediaPipe Pose Landmarker (WASM-based execution in-browser).
- **UX**: Dashboard-driven interface for role-based access (Doctor vs. Patient).

---

## 3. Machine Learning Pipeline (Teacher-Student Architecture)
One of the most significant technical achievements of this project is the **Teacher-Student** training paradigm.

### 3.1 Data Engineering & Synthetic Generation
To overcome the lack of massive labeled clinical datasets, a sophisticated **Kinematic Simulator** was developed.
- **Volume**: 14,000 synthetic repetitions across 7 exercise types.
- **Diversity**: Simulations include varying Range of Motion (ROM), speeds, balance instability (sway), and joint asymmetry.
- **Noise Modelling**: Gaussian jitter and temporal drift were added to simulate real-world sensor noise.

### 3.2 Feature Engineering
A 12-dimensional feature vector is extracted per-frame to represent the user's state:
1.  **Angle**: Primary joint angle (e.g., knee flex).
2.  **Hip Center X**: Horizontal positioning for stability analysis.
3.  **Velocity**: Rate of change of the primary angle.
4.  **Temporal Progress**: Normalized position within the rep (0.0 to 1.0).
5.  **Left Angle**: Side-specific biomechanics.
6.  **Right Angle**: Side-specific biomechanics.
7.  **Exercise ID**: One-hot encoded context.
8.  **Rep Duration**: Total time taken for the current repetition.
9.  **Frame Count**: Sequence length indicator.
10. **Running Sway**: Standard deviation of hip movement.
11. **Running ROM**: Cumulative range of motion.
12. **Padding Mask**: Boolean mask for variable-length sequence handling.

### 3.3 Model Comparison & Selection
The project explored three deep learning architectures for sequence regression:
- **LSTM (Long Short-Term Memory)**: Best for capturing long-range temporal dependencies in rehab movements. (Chosen for production).
- **TCN (Temporal Convolutional Networks)**: High-speed parallel processing for short-term patterns.
- **Transformer**: Self-attention mechanism for highly complex, non-linear movement analysis.

### 3.4 Training Recipe
- **Loss Function**: `SmoothL1Loss` (Huber Loss) with $\beta=5.0$. This ensures the model is robust to outliers — common in shaky or incorrect patient movements.
- **Optimizer**: `AdamW` with weight decay ($1e^{-4}$).
- **Scheduler**: Linear warmup (5 epochs) followed by Cosine Decay for precise convergence.

---

## 4. Biomechanical Scoring Logic
The scoring engine translates raw joint landmarks into clinical metrics using four pillars:

### 4.1 Range of Motion (ROM)
Measures the maximum joint extension/flexion achieved compared to the therapeutic target.
$$Score_{ROM} = \min\left(\frac{ROM_{achieved}}{ROM_{target}} \times 100, 100\right)$$

### 4.2 Stability (Sway)
Analyzes horizontal hip displacement ($\sigma$ of hip\_x). Higher sway results in a stability penalty, critical for fall-risk assessment.

### 4.3 Tempo
Compares actual repetition time to the `ideal_rep_time`.
- **Asymmetric Penalty**: Moving too **fast** is penalized 4x more harshly than moving too **slowly**, as fast movements often compromise form and safety in a rehab context.

### 4.4 Asymmetry
Calculates the difference between left and right limb performance to detect compensatory movements or muscular imbalances.

---

## 5. Deployment & Scalability
- **Containerization**: Both services are Dockerized for environment parity.
- **Inference**: Optimized for CPU-based inference to maintain low deployment costs while meeting the 30 FPS real-time requirement.

---

## 6. Conclusion
Rehab AI demonstrates that high-quality therapeutic guidance can be delivered remotely using modern AI. By synthesizing clinical heuristics with deep learning, the platform provides a scalable solution to physical therapy accessibility.
