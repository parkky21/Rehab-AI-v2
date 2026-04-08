# Rehab AI — Movement Intelligence Platform

Rehab AI is a comprehensive tele-rehabilitation platform designed to bridge the gap between clinical physical therapy and at-home exercise routines. By leveraging **MediaPipe Pose** for real-time motion tracking and a robust **FastAPI** backend, the platform provides patients with immediate feedback on their form while allowing doctors to manage treatments and monitor progress remotely.

## 🏗 Project Architecture

The system is composed of two primary modules:

*   **`python-server`**: A high-performance FastAPI backend that handles user authentication, exercise management, data persistence with MongoDB, and real-time motion analysis via WebSockets.
*   **`web-client`**: A modern React + TypeScript frontend built with Vite, providing interactive dashboards for both doctors and patients, and a live exercise console with camera-based tracking.

## 🚀 Key Features

### 👨‍⚕️ For Doctors
*   **Patient Management**: Link patients to your profile to manage their care.
*   **Exercise Prescriptions**: Assign specific exercises from the catalog to individual patients.
*   **Progress Analytics**: View detailed reports on patient adherence, form accuracy, and session history over time.

### 🧘 For Patients
*   **Real-time Feedback**: Use your device's camera for live pose tracking during exercises.
*   **Smart Counters**: Automatically count repetitions based on joint angle analysis.
*   **Progress Tracking**: Monitor your own journey through trend summaries and historical session data.

---

## 🛠 Getting Started

### Prerequisites
*   [Docker](https://www.docker.com/products/docker-desktop/) (Recommended for full stack)
*   [Python 3.12+](https://www.python.org/downloads/) (For local backend dev)
*   [Node.js 20+](https://nodejs.org/) (For local frontend dev)

### Fast Track (Full Stack with Docker)

The easiest way to run the entire system is using Docker Compose:

1.  Clone the repository:
    ```bash
    git clone https://github.com/parkky21/Rehab-AI-v2.git
    cd Rehab-AI-v2
    ```

2.  Initialize environment variables:
    ```bash
    cp python-server/.env.example python-server/.env
    cp web-client/.env.example web-client/.env
    ```

3.  Launch the services:
    ```bash
    # From the python-server directory (where the compose file lives)
    cd python-server
    docker compose up --build
    ```

*   **Web App**: `http://localhost:5173`
*   **API Docs**: `http://localhost:8000/docs`

---

## 💻 Manual Development Setup

### Backend (`python-server`)
The backend uses `uv` for package management.

1.  Navigate to the server directory: `cd python-server`
2.  Install dependencies: `uv sync`
3.  Seed demo data: `uv run python -m api_server.seed_demo`
4.  Run the server: `uv run uvicorn api_server.main:app --reload`

### Frontend (`web-client`)
1.  Navigate to the client directory: `cd web-client`
2.  Install dependencies: `npm install`
3.  Run development server: `npm run dev`

---

## 📡 API Overview (v1)

*   `POST /auth/register` & `/auth/login`: Identity management.
*   `GET /exercises`: The catalog of available movement patterns.
*   `GET /doctor/patients`: Management views for practitioners.
*   `WS /ws/session`: The primary real-time entry point for pose data and guidance.

---

## 📜 License
This project is private and intended for internal use and demonstration purposes.
