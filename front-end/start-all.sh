#!/bin/bash
# Start both backend and frontend servers concurrently

cd "$(dirname "$0")"

echo "🚀 Starting Solace Health Check Application"
echo "=============================================="
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend in background
./start-backend.sh &

# Wait a moment for backend to start
sleep 2

# Start frontend in background
./start-frontend.sh &

# Wait for all background processes
wait
