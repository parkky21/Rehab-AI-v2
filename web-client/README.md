# Rehab AI Web Client

React + TypeScript + Vite frontend for the Rehab AI platform.

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Default values:

- `VITE_API_BASE_URL=http://localhost:8000/api/v1`
- `VITE_WS_BASE_URL=ws://localhost:8000/api/v1`

## Run with Docker Compose

Use the compose file in `python-server` to run full stack:

```bash
cd ../python-server
docker compose up --build
```

Web app: `http://localhost:5173`
API docs: `http://localhost:8000/docs`

## Main Screens

- Login/Register page with role selection
- Doctor Dashboard: patient linking, assignment creation, report view
- Patient Console: assignment selection, live camera session, realtime feedback and counters
