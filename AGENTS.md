# Telegram Web Client - Project Guide

## Project Overview
Telegram personal web client with frontend-backend separation architecture.

## Architecture
- **backend/**: Node.js + Express + gram.js (MTProto) + Socket.io + Better-SQLite3
- **frontend/**: React 18 + Vite + Tailwind CSS + Socket.io-client

## Build & Run Commands

### Backend
```bash
cd backend
pnpm install
pnpm run dev     # Development (tsx watch)
pnpm run build   # TypeScript compile
pnpm run start   # Production
```

### Frontend
```bash
cd frontend
pnpm install
pnpm run dev     # Vite dev server with HMR
pnpm run build   # Production build
```

## Environment Variables
Backend requires Telegram API credentials (see `backend/.env.example`):
- `TELEGRAM_API_ID`: Telegram API ID
- `TELEGRAM_API_HASH`: Telegram API Hash
- `DEPLOY_RUN_PORT`: Server port (default: 3001)

## Key Files
- `backend/src/index.ts` - Express + Socket.io server entry
- `backend/src/services/telegram.ts` - gram.js MTProto client wrapper
- `backend/src/db/database.ts` - SQLite schema and connection
- `backend/src/routes/` - REST API routes (auth, chats, contacts)
- `frontend/src/App.tsx` - Root component with auth routing
- `frontend/src/pages/ChatPage.tsx` - Main chat layout
- `frontend/src/components/Sidebar.tsx` - Chat list sidebar
- `frontend/src/components/ChatWindow.tsx` - Message display and input
- `frontend/src/services/api.ts` - REST API client
- `frontend/src/services/socket.ts` - Socket.io client

## API Endpoints
- `POST /api/auth/send-code` - Send verification code
- `POST /api/auth/verify-code` - Verify code
- `POST /api/auth/qr-login` - Get QR code
- `POST /api/auth/qr-check` - Check QR login status
- `GET /api/auth/check` - Check auth status
- `POST /api/auth/logout` - Logout
- `GET /api/chats` - Get chat list
- `GET /api/chats/:id/messages` - Get messages (offset/limit)
- `POST /api/chats/:id/messages` - Send message
- `GET /api/contacts` - Get contacts
- `GET /api/chats/:id/members` - Get group members
- `POST /api/chats/create-group` - Create group

## WebSocket Events
- `new-message` - New message push
- `chat-update` - Chat list update
- `message-read` - Message read status
- `user-status` - User online status

## Development Notes
- Frontend dev server runs on port 5000 with Vite proxy to backend (port 3001)
- Backend data stored in `backend/data/telegram.db` (SQLite)
- gram.js session persisted in SQLite for auto-reconnect
