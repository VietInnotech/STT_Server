# Deployment Configuration Guide

## How Your Server Connects to the App & MAIE Server

### Current Architecture Overview

Your system has **three main components**:

1. **Backend Server** (Node.js/Express + Socket.IO)
2. **Frontend App** (React + Vite)
3. **MAIE AI Server** (External API)

---

## 1. App-to-Server Connection

### HTTP REST API
- **Frontend URL**: Configured in `client/src/lib/api.ts`
  - Uses `VITE_API_URL` environment variable
  - Falls back to `window.location.origin` (current browser address)
- **Base URL**: `${API_BASE_URL}/api`
- **Authentication**: Bearer token sent in `Authorization` header
- **All endpoints** are prefixed with `/api/` (auth, files, users, devices, etc.)

### WebSocket Connection (Socket.IO)
- **Frontend**: `client/src/stores/socket.ts`
  - Connects to `VITE_API_URL || window.location.origin`
  - Auto-reconnects with 5 attempts, 1-second delay
  - Used for real-time events (device status, file sharing notifications)
- **Backend**: Configured in `index.ts`
  - CORS configured for development (accepts all origins) or production (uses `CORS_ORIGIN` env var)

---

## 2. Server-to-MAIE Connection

### Configuration
Located in `src/lib/maieProxy.ts`:
- **MAIE_URL**: `process.env.MAIE_API_URL || "http://localhost:8000"`
- **API Key**: `process.env.MAIE_API_KEY` (required)

### Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/process` | Submit audio for transcription + summarization |
| `POST /v1/process_text` | Submit text for summarization |
| `GET /v1/status/{taskId}` | Check processing status |
| `GET /health` | Health check |

---

## 3. How to Change Configuration for Another System

### Option A: Environment Variables (.env file)

Create or update `/home/cetech/UNV_AI_REPORT_SERVER_V2/.env`:

```bash
# Server
PORT=3000
NODE_ENV=development

# MAIE AI Server (change this to your new system)
MAIE_API_URL=http://your-new-maie-server.com:8000
MAIE_API_KEY=your_api_key_here

# Frontend API (for production builds)
# Leave empty to use the same host as the frontend

# CORS (in production, set the allowed origin)
CORS_ORIGIN=http://your-app-domain.com
TRUST_PROXY=true  # If behind a proxy/load balancer

# Database
DATABASE_URL="file:./dev.db"

# JWT & Encryption
JWT_SECRET="your-new-secret-key"
ENCRYPTION_KEY="your-new-encryption-key"
```

### Option B: Frontend API Configuration

For the frontend (React app), create `client/.env` or `client/.env.local`:

```bash
# API URL for the frontend to connect to backend
# Leave empty to use current browser address
VITE_API_URL=http://your-backend-server.com:3000
```

### Option C: Docker/Kubernetes Deployment

When deploying with Docker/containers, pass environment variables at runtime:

```bash
docker run \
  -e MAIE_API_URL=http://maie-server:8000 \
  -e MAIE_API_KEY=your_key \
  -e PORT=3000 \
  -e CORS_ORIGIN=http://frontend-domain.com \
  -p 3000:3000 \
  your-server-image
```

---

## 4. Deployment Scenarios

### Local Development (Current Setup)
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173` (Vite dev server)
- MAIE: `http://localhost:8000`
- No environment variables needed (uses defaults)

### LAN Deployment (Same Network)
1. Get your server machine IP: `hostname -I`
2. In `.env`: `CORS_ORIGIN=http://192.168.x.x:3000`
3. Access frontend from any device: `http://192.168.x.x:3000`
4. Note in `index.ts`: Already supports LAN in development mode

### Production Deployment (Different Server)
1. Set `NODE_ENV=production`
2. Build frontend: `bun run build:client`
3. Set these in `.env`:
   ```bash
   NODE_ENV=production
   CORS_ORIGIN=https://your-domain.com
   MAIE_API_URL=https://maie-server.your-domain.com
   MAIE_API_KEY=production_key
   PORT=3000
   TRUST_PROXY=true
   ```
4. Run: `bun run start`

### Multi-Server Setup (Different Hosts)
- **Backend Server**: One machine at `192.168.1.100:3000`
- **MAIE Server**: Another machine at `192.168.1.101:8000`
- **Frontend**: Served from backend, access via `http://192.168.1.100:3000`

Backend `.env`:
```bash
PORT=3000
MAIE_API_URL=http://192.168.1.101:8000
MAIE_API_KEY=key123
```

---

## 5. Key Files to Remember

| File | Purpose | Change For |
|------|---------|-----------|
| `.env` (root) | Backend config | MAIE URL, DB, JWT secrets, CORS |
| `client/.env.local` | Frontend API URL | Pointing to different backend |
| `index.ts` | Server entry point | CORS logic, port config |
| `src/lib/maieProxy.ts` | MAIE integration | API endpoints, headers |
| `client/src/lib/api.ts` | Frontend HTTP client | API base URL (via VITE_API_URL) |
| `client/src/stores/socket.ts` | WebSocket client | Socket.IO connection URL |

---

## 6. Testing Connectivity After Changes

```bash
# Test backend health
curl http://your-backend:3000/api/health

# Test MAIE connectivity (if accessible)
curl -X GET http://your-maie-server:8000/health \
  -H "X-API-Key: your_key"

# Check logs for errors
NODE_ENV=production bun run start 2>&1 | tee server.log
```

---

## 7. Security Notes for Production

- **JWT_SECRET**: Generate a strong random key
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- **ENCRYPTION_KEY**: Generate a 256-bit (64 hex character) key
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- **MAIE_API_KEY**: Keep this secret; never commit to version control

- **CORS_ORIGIN**: Always restrict to known domains in production

- **TRUST_PROXY**: Enable only when behind a reverse proxy (nginx, HAProxy, etc.)

---

## 8. Environment Variable Reference

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | `file:./dev.db` | SQLite path or DB connection string |
| `JWT_SECRET` | (required) | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiration |
| `ENCRYPTION_KEY` | (required) | 256-bit AES encryption key (hex) |
| `MAIE_API_URL` | `http://localhost:8000` | MAIE server URL |
| `MAIE_API_KEY` | (required) | API key for MAIE authentication |
| `CORS_ORIGIN` | `true` (dev), `false` (prod) | Allowed CORS origin |
| `TRUST_PROXY` | `false` | Trust X-Forwarded-* headers |

### Frontend (client/.env.local)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `window.location.origin` | Backend API base URL |

---

## 9. Common Deployment Issues & Solutions

### Issue: "CORS error when connecting from different host"
**Solution**: Set `CORS_ORIGIN` in `.env` to match your frontend URL
```bash
CORS_ORIGIN=http://192.168.1.100:3000
```

### Issue: "Cannot connect to MAIE server"
**Solution**: Verify `MAIE_API_URL` and `MAIE_API_KEY` are correct
```bash
# Test connectivity
curl http://your-maie-server:8000/health
```

### Issue: "Frontend shows 'API not responding'"
**Solution**: Ensure `VITE_API_URL` is set correctly in `client/.env.local` (if using different backend)

### Issue: "Socket.IO connection fails"
**Solution**: WebSocket needs same CORS origin; verify `CORS_ORIGIN` env var matches frontend domain

### Issue: "Database connection error"
**Solution**: For SQLite, ensure `prisma/` folder is writable. For external DB, verify `DATABASE_URL` connection string

---

## 10. Quick Start for New Deployment

1. **Clone/copy the project** to your new system
2. **Install dependencies**: `bun install && cd client && bun install && cd ..`
3. **Create `.env` file**:
   ```bash
   PORT=3000
   NODE_ENV=production
   DATABASE_URL="file:./dev.db"
   JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   MAIE_API_URL=http://your-maie-server:8000
   MAIE_API_KEY=your_api_key
   CORS_ORIGIN=https://your-domain.com
   TRUST_PROXY=true
   ```
4. **Build frontend**: `bun run build:client`
5. **Initialize database**: `bun run db:migrate` (first time only)
6. **Start server**: `bun run start`
7. **Access at**: `https://your-domain.com`

---

## 11. Switching Between Environments

```bash
# Development
cp .env.example .env
# Modify .env as needed for dev
bun run dev

# Production
NODE_ENV=production bun run build:client
NODE_ENV=production bun run start

# Staging (with different MAIE server)
MAIE_API_URL=http://staging-maie:8000 NODE_ENV=production bun run start
```

