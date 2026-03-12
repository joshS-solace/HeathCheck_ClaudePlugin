#!/bin/bash
# Start the Python FastAPI backend server

cd "$(dirname "$0")/../back-end"

echo "🚀 Starting Backend Server..."
echo "📍 Backend will run at: http://localhost:8000"
echo ""

# Install Python dependencies if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Start the FastAPI server
python3 api_server.py
