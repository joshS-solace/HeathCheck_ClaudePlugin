#!/bin/bash
# Start the React frontend dev server

cd "$(dirname "$0")"

echo "🎨 Starting Frontend Server..."
echo "📍 Frontend will run at: http://localhost:5173"
echo ""

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start Vite dev server
npm run dev
