# sqlchat

Ask your MySQL database questions in plain English.

## Setup

### Backend
```
cd backend
npm install
npm run dev
```
Runs on http://localhost:3005

### Frontend
```
cd frontend
npm install
npm run dev
```
Runs on http://localhost:5173

## Requirements
- XAMPP MySQL running with `allocation` database
- Ollama running on 192.168.1.10:11434 with `qwen3-coder:30b` model

## API Endpoints
- `GET  /api/health`        - Check MySQL + server status
- `GET  /api/schema`        - View loaded schema
- `POST /api/schema/refresh` - Force schema reload
- `POST /api/query`         - `{ question: "..." }` -> `{ sql, rows, columns, rowCount, durationMs }`
