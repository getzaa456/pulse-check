# Pulse Check

Pulse Check is an uptime/status-page service that checks websites and APIs on a schedule, stores availability and response-time history, and sends alerts when services go down or recover.

## Project Structure

Frontend and backend are separated into their own application folders:

```text
pulse-check/
├─ frontend/
│  ├─ src/
│  │  ├─ App.tsx
│  │  ├─ api.ts
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ Dockerfile
│  ├─ nginx.conf
│  ├─ package.json
│  └─ tsconfig.json
│
├─ backend/
│  ├─ src/
│  │  ├─ app.ts
│  │  ├─ auth.ts
│  │  ├─ checker.ts
│  │  ├─ config.ts
│  │  ├─ db.ts
│  │  ├─ notifier.ts
│  │  ├─ server.ts
│  │  └─ worker.ts
│  ├─ tests/
│  ├─ scripts/
│  │  └─ trivy-scan.ps1
│  ├─ Dockerfile
│  ├─ package.json
│  └─ tsconfig.json
│
├─ docs/
├─ docker-compose.yml
├─ .env.example
├─ ROADMAP.md
└─ README.md
```

Files at the repository root are shared infrastructure/documentation rather than frontend or backend application code.

## Stack

### Frontend

- React
- TypeScript
- Vite
- Nginx for the production container

### Backend

- Node.js
- TypeScript
- Express
- PostgreSQL
- Redis + BullMQ
- JWT + bcrypt
- SMTP / Discord notifications
- Vitest + Supertest

## Try the Complete App

From the repository root:

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:3000
```

The backend API is also exposed directly at:

```text
http://localhost:8080
```

Check containers:

```bash
docker compose ps
```

Stop everything:

```bash
docker compose down
```

## Frontend Development

Run the frontend from its own folder:

```bash
cd frontend
npm install
npm run dev
```

Vite runs at `http://localhost:3000` and proxies API/status requests to the backend at `http://localhost:8080`.

Build the frontend:

```bash
cd frontend
npm run build
```

## Backend Development

Run backend commands from the backend folder:

```bash
cd backend
npm install
npm run dev
```

Run the worker in another terminal:

```bash
cd backend
npm run dev:worker
```

Build:

```bash
cd backend
npm run build
```

Run tests:

```bash
cd backend
npm test
```

Check formatting:

```bash
cd backend
npm run format:check
```

## Local Configuration

Shared Docker configuration is documented in the root `.env.example`.

Copy it when local overrides are needed:

```text
.env.example -> .env
```

Never commit real credentials or secrets.

## Container Security

Both application containers run without root privileges:

- backend runs as the built-in Node `node` user
- frontend runs with `nginx-unprivileged`

Scan the backend image with Trivy:

```powershell
./backend/scripts/trivy-scan.ps1
```

## Main Features

The frontend currently supports:

- registration and login
- creating uptime monitors
- UP / DOWN / UNKNOWN monitor status
- automatic state refresh
- deleting monitors
- creating a public status page

The backend provides:

- Auth API
- Monitor CRUD
- checker worker
- BullMQ scheduling
- incident tracking
- email / Discord alerts
- public status pages
- `/healthz` and `/readyz`

See [docs/architecture.md](docs/architecture.md) for the architecture and [ROADMAP.md](ROADMAP.md) for development phases.
