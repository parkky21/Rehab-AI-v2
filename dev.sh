#!/bin/bash

# Rehab AI Development Script
# This script runs both the Python backend and the React frontend concurrently.

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    # Kill all background processes started by this script
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

echo "🚀 Starting Rehab AI Development Environment..."

# 1. Check for .env files
if [ ! -f "python-server/.env" ]; then
    echo "⚠️  Warning: python-server/.env not found."
    if [ -f "python-server/.env.example" ]; then
        echo "   Creating .env from .env.example..."
        cp python-server/.env.example python-server/.env
    fi
fi

if [ ! -f "web-client/.env" ]; then
    echo "⚠️  Warning: web-client/.env not found."
    if [ -f "web-client/.env.example" ]; then
        echo "   Creating .env from .env.example..."
        cp web-client/.env.example web-client/.env
    fi
fi

# 2. Check if MongoDB is running (optional but helpful)
if ! nc -z localhost 27017 2>/dev/null; then
    echo "ℹ️  MongoDB is not running on localhost:27017."
    echo "   Starting MongoDB container via Docker..."
    (cd python-server && docker compose up -d mongodb)
else
    echo "✅ MongoDB is already running."
fi

# 3. Start Backend
echo "📡 Starting Backend API (port 8000)..."
(cd python-server && uv run uvicorn api_server.main:app --reload --port 8000) &
BACKEND_PID=$!

# 4. Start Frontend
echo "💻 Starting Frontend Web Client (port 5173)..."
(cd web-client && npm run dev) &
FRONTEND_PID=$!

echo "---"
echo "API Docs: http://localhost:8000/docs"
echo "Web App:  http://localhost:5173"
echo "Press Ctrl+C to stop both services."
echo "---"

# Wait for background processes
wait
