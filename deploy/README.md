# Production VM Deployment

This deployment path uses one Ubuntu VM, Docker Compose, Caddy, and a GitHub Actions self-hosted runner.

## Architecture

```text
Internet
   |
  80/443
   |
 Caddy
   |
Frontend (Nginx)
   |
Backend API
   |
PostgreSQL + Redis

Self-hosted GitHub Actions Runner
   |
docker compose up -d
```

Only Caddy should be reachable from the public internet. PostgreSQL, Redis, the backend API, and the worker stay on the Docker network.

## 1. Prepare the Ubuntu VM

Recommended baseline:

- Ubuntu Server 24.04 LTS or newer
- 2 vCPU
- 2-4 GB RAM
- 20+ GB disk
- a public IP
- a domain name pointed to the VM

Install Git and Docker Engine with the Docker Compose plugin using Docker's official Ubuntu instructions.

Create a dedicated runner user instead of running GitHub Actions as root.

Example:

```bash
sudo useradd --create-home --shell /bin/bash github-runner
sudo usermod -aG docker github-runner
sudo mkdir -p /opt/pulse-check
sudo chown github-runner:github-runner /opt/pulse-check
```

Log out and back in after adding the user to the `docker` group so the group membership is refreshed.

## 2. Register the GitHub Actions Runner

In the GitHub repository open:

```text
Settings
→ Actions
→ Runners
→ New self-hosted runner
→ Linux
→ x64
```

GitHub will show the current download and registration commands. Run those commands on the VM as the `github-runner` user.

The deploy workflow uses the default Linux runner labels:

```text
self-hosted
linux
```

You may add a custom label later if you operate multiple runners, but it is not required for this project.

After registration, install the runner as a system service using the service command shown by GitHub so it starts again after a VM reboot.

Do not copy runner registration tokens into this repository. They are short-lived credentials and should only be used directly on the VM.

## 3. Create Production Secrets on the VM

The deployment workflow intentionally does not copy production secrets from the repository.

Create:

```text
/opt/pulse-check/.env.production
```

Use `deploy/.env.production.example` as the template.

Protect it:

```bash
sudo chown github-runner:github-runner /opt/pulse-check/.env.production
sudo chmod 600 /opt/pulse-check/.env.production
```

Required values:

- `APP_DOMAIN`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`

Notification settings are optional.

## 4. DNS and Firewall

Create an A record for `APP_DOMAIN` pointing to the VM public IPv4 address. Add an AAAA record only when IPv6 is configured correctly.

Allow inbound:

- TCP 22 for SSH, preferably restricted to trusted source IPs
- TCP 80 for HTTP
- TCP 443 for HTTPS
- UDP 443 optionally for HTTP/3

Do not expose PostgreSQL port 5432 or Redis port 6379.

Caddy obtains and renews TLS certificates automatically after DNS points to the VM and ports 80/443 are reachable.

## 5. Deployment Flow

Normal flow:

```text
push main
   ↓
CI on GitHub-hosted runner
   ↓
CI succeeds
   ↓
Deploy workflow
   ↓
Self-hosted runner on VM
   ↓
Build images locally
   ↓
docker compose up -d
   ↓
/readyz health verification
```

The deployment workflow can also be started manually from the GitHub Actions UI through `workflow_dispatch`.

## 6. Verify Production

On the VM:

```bash
docker compose   --env-file /opt/pulse-check/.env.production   -f docker-compose.prod.yml   ps
```

From another machine:

```text
https://YOUR_DOMAIN/readyz
```

It should return:

```json
{"status":"ok"}
```

## 7. Rollback

This project intentionally uses a simple rollback strategy.

In GitHub:

1. Find the last known-good commit on `main`.
2. Revert the bad commit, or create a revert commit.
3. Push the revert to `main`.
4. CI runs again.
5. The self-hosted runner redeploys that known-good source.

For an urgent manual rollback, check out the known-good commit on the VM runner workspace only when no Actions job is running, then run `deploy/deploy.sh`. Prefer a Git revert because it keeps repository history and deployed state aligned.

PostgreSQL data is stored in a named Docker volume and is not deleted during normal deploys.

## Security Notes

A self-hosted runner can execute commands with the permissions of its VM user. Treat access to workflows and `main` as production access.

For this reason:

- CI for pull requests stays on GitHub-hosted runners.
- Only the deploy job uses the self-hosted runner.
- Protect `main` with pull-request review if the repository has multiple contributors.
- Do not use this production runner for workflows triggered directly by untrusted fork pull requests.
- Keep the runner, Ubuntu packages, and Docker updated.
