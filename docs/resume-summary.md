# Pulse Check — Resume / Portfolio Summary

## Short Resume Version

Built **Pulse Check**, a containerized uptime monitoring platform with a React frontend and Node.js/TypeScript backend. Implemented scheduled HTTP checks with BullMQ/Redis, PostgreSQL persistence, JWT authentication, public status pages, alerting, GitHub Actions CI/CD with a self-hosted Ubuntu VM runner, and Prometheus/Grafana monitoring.

## Resume Bullets

- Built a full-stack uptime monitoring platform using **React, TypeScript, Node.js, Express, PostgreSQL, Redis, and BullMQ**.
- Implemented scheduled HTTP/HTTPS checks with timeout handling, redirect limits, SSRF protections, incident tracking, and UP/DOWN recovery transitions.
- Added JWT authentication, monitor CRUD, public status pages, SMTP/Discord notifications, and containerized frontend/backend services.
- Created a lightweight **GitHub Actions CI pipeline** for linting, formatting, tests, and builds.
- Implemented **continuous deployment to an Ubuntu VM using a self-hosted GitHub Actions runner and Docker Compose**.
- Added **Prometheus metrics and a provisioned Grafana dashboard** for request rate, 5xx errors, p95 latency, and monitor state counts.

## Portfolio Description

Pulse Check is an uptime/status-page service that periodically checks websites and APIs, stores availability and response-time history, opens incidents when a target goes down, resolves incidents on recovery, and exposes both an authenticated dashboard and public status pages.

The project was designed as a DevOps-focused portfolio project rather than only an application-development exercise. It includes containerization, CI/CD, a self-hosted deployment target, health checks, secrets separation, and metrics-based monitoring.

## Technical Highlights

### Application

- React + TypeScript + Vite frontend
- Node.js + TypeScript + Express backend
- PostgreSQL as the durable source of truth
- Redis + BullMQ for background check jobs
- JWT + bcrypt authentication
- SMTP email and Discord webhook notifications

### Reliability and Security

- liveness endpoint: `/healthz`
- readiness endpoint: `/readyz`
- Prometheus endpoint: `/metrics`
- HTTP timeout and redirect limits
- private/local IP rejection for monitor targets
- non-root Docker runtime users
- production secrets stored outside the Git repository

### DevOps

- multi-stage Docker builds
- Docker Compose local and VM deployment
- GitHub Actions CI
- GitHub Actions self-hosted runner on Ubuntu VM for deployment
- deployment health verification
- simple Git-revert rollback strategy
- Prometheus + Grafana monitoring

## Interview Talking Points

1. **Why Redis/BullMQ?** The API should not perform uptime checks synchronously. A queue separates user requests from background monitoring work.
2. **Why PostgreSQL remains the source of truth?** Redis is transient queue infrastructure, while monitor state, incidents, and check history remain durable in PostgreSQL.
3. **Why use a self-hosted runner only for deployment?** Pull-request CI stays on GitHub-hosted runners. The VM runner has production-level Docker access, so it is restricted to deployment after CI succeeds.
4. **Why Prometheus and Grafana only?** The observability scope was intentionally kept small: collect useful application metrics and visualize them without adding a full logging/tracing stack.
5. **How does rollback work?** A bad change is reverted in Git. The revert goes through CI and the VM deploy workflow redeploys the known-good source.

## Metrics to Measure Later

Do not claim these values until they have been measured:

- maximum practical number of monitors on the current VM
- checks processed per minute
- p50 / p95 / p99 API latency under load
- CPU and memory usage at a known monitor count
- queue depth during load tests
- deployment duration
