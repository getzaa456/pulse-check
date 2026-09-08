# Pulse Check

Pulse Check is an uptime/status-page service that periodically checks websites and APIs, stores availability and response-time history, and notifies users when monitored services go down or recover.

The project is intentionally built in phases to demonstrate a practical DevOps lifecycle from planning through production.

## Architecture

The current architecture is documented in [docs/architecture.md](docs/architecture.md).

Core direction:

- **Backend / workers:** Go
- **Frontend:** Next.js + TypeScript
- **Database:** PostgreSQL + TimescaleDB
- **Queue / coordination:** Redis
- **Local development:** Docker Compose
- **CI/CD:** GitHub Actions + GHCR

## Repository Status

The project is currently at **Phase 1 — Project Setup & Foundation**.

Application services will be introduced in Phase 2. Phase 1 only establishes repository conventions, configuration defaults, and basic formatting so the project stays lightweight.

## Git Workflow

This repository uses **GitHub Flow**:

1. Keep `main` deployable.
2. Create a short-lived branch for each change, for example:
   - `feat/monitor-crud`
   - `fix/check-timeout`
   - `docs/architecture`
3. Commit focused changes.
4. Open a pull request into `main`.
5. Review and merge after required checks pass.
6. Delete the merged branch.

Direct feature work on `main` should be avoided. Branch protection can be enabled on GitHub once repository rules are configured.

## Local Configuration

Copy the example environment file and fill in local values:

```text
.env.example -> .env
```

Do not commit `.env` or any file containing real secrets.

Configuration principles:

- Environment variables are the source of runtime configuration.
- Defaults may be used only for safe local-development values.
- Secrets must not be committed to Git.
- Production secrets should be supplied by the deployment platform or secrets manager.
- Timestamps will be stored in UTC.

## Formatting

Repository-wide text, Markdown, JSON, YAML, TypeScript, and frontend files use Prettier.

Available commands:

```bash
npm install
npm run format
npm run format:check
```

Go source files will use the standard `gofmt` formatter when the Go services are added in Phase 2.

## Planned Services

The architecture separates user-facing traffic from asynchronous monitoring work:

- Web application
- API service
- Scheduler
- Checker worker
- Notification worker
- PostgreSQL / TimescaleDB
- Redis

See [docs/architecture.md](docs/architecture.md) for the component and data-flow diagrams.

## Roadmap

Development phases are tracked in [ROADMAP.md](ROADMAP.md).
