---
applyTo: '**'
---

Context:
I’m building a Node.js server with Socket.IO to maintain real-time uptime status between Android devices and the backend.
This system will also include a ReactJS frontend for local administration, file management, and real-time monitoring.
The entire system will run offline (no internet access) on a local network (LAN/intranet).

System Overview:
A fully local, secure, and real-time system supporting Android clients, a Node.js backend, and a ReactJS dashboard.
Everything — authentication, logging, storage, and UI — must function without any cloud or external dependency.

Backend Stack:
- Runtime: Node.js (LTS version)
- Framework: Express.js
- Real-time: Socket.IO (for uptime, events, and notifications)
- Database: SQLite (local instance for users, roles, logs, and file metadata)
- ORM: Prisma (local schema, no remote sync)
- Cache / PubSub: Redis (local, used for sessions and Socket.IO scaling)
- Storage: .wav and .txt files stored in the database (encrypted BLOB)
- Scheduler: node-cron or BullMQ (local queue) for auto-delete after N days
- Authentication / SSO: Keycloak (self-hosted, offline OAuth2 + SSO + RBAC)
- Logging: Winston + SQLite (audit trail for every user action)
- Encryption: AES-256 for files, bcrypt for passwords, built-in crypto
- SSL: Self-signed certificates (HTTPS for LAN)
- Documentation: Swagger (served locally for internal API testing)

Frontend Stack (ReactJS):
- Framework: ReactJS (Vite-based build)
- UI Framework: TailwindCSS + shadcn/ui (no external CDN)
- State Management: Zustand (lightweight, no remote sync)
- Data Fetching: Axios
- Real-time: socket.io-client (sync with backend)
- Validation: Zod (type-safe forms)
- Routing: React Router DOM
- Notifications: React Hot Toast (local events)
- Auth UI: Integrated with local Keycloak instance
- Build: Served by Node.js (Express static) or Nginx locally

Deployment Stack:
- Environment: Windows or Linux local server (no cloud)
- Service Manager: PM2 or systemd (auto-start on boot)

Security:
- AES-256 file encryption
- bcrypt password hashing
- HTTPS via self-signed SSL
- Keycloak-based RBAC (role-based access control)
- CSRF protection
- Rate limiting and Helmet.js
- Audit logs for every event (login, upload, view, edit, delete, admin actions)

Communication Flow:
1. Android devices connect to the local Wi-Fi.
2. Socket.IO communicates directly with the Node.js backend (192.168.x.x:3000).
3. ReactJS frontend connects to the same local backend for management and monitoring.
4. All data, logs, and authentication remain inside the local network.

Optional Enhancements (Offline):
- Local React dashboard for server health, uptime, and logs.
- Offline AI summarizer (Ollama or LM Studio).
- Local audio preprocessing with ffmpeg or OpenCV.
- Automatic backup (daily tar.gz of /data/uploads + DB dump).

Development Rule:
Make sure to implement and test one feature at a time before moving to the next.

Goal:
Develop a modular, secure, and offline-capable full-stack system using Node.js for the backend and ReactJS for the frontend, supporting real-time communication, file management, authentication, encryption, and complete audit logging.
