#!/bin/bash
# Start both backend and frontend servers from the project root

cd "$(dirname "$0")"

echo "Starting Solace Health Check Application"
echo "========================================="
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
(cd back-end && python api_server.py) &

sleep 2

# Start frontend
(cd front-end && npm run dev) &

wait
