# Private-LAN VM Deployment

This setup is for an Ubuntu Server VM on VMware with a private IP address.

It uses Docker Compose and a GitHub Actions self-hosted runner. The frontend is exposed on VM port 3000. Backend, PostgreSQL, Redis, and worker stay inside the Docker network. Caddy/domain/HTTPS are intentionally not used in this phase.

## VM requirements

- Ubuntu Server
- Git
- Docker Engine
- Docker Compose plugin
- GitHub Actions self-hosted runner
- `/opt/pulse-check/.env.production`

Node.js, PostgreSQL, Redis, and Nginx do not need to be installed directly on the VM because they run in containers.

## Production environment file

Create `/opt/pulse-check/.env.production` using `deploy/.env.production.example` as a template.

Minimum values:

```text
FRONTEND_PORT=3000
POSTGRES_DB=pulsecheck
POSTGRES_USER=pulsecheck
POSTGRES_PASSWORD=replace-with-a-strong-password
JWT_SECRET=replace-with-a-long-random-secret
```

Protect it:

```bash
sudo chown ubuntu:ubuntu /opt/pulse-check/.env.production
sudo chmod 600 /opt/pulse-check/.env.production
```

If your runner uses another Linux user, use that user instead of `ubuntu`.

## Runner permissions

The deploy workflow uses:

```yaml
runs-on: [self-hosted, linux]
```

The runner user must be able to run Docker without sudo.

```bash
sudo usermod -aG docker ubuntu
```

Then log out/in again or restart the runner service.

Check:

```bash
docker ps
docker compose version
```

## Deployment flow

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
docker compose build/up
   ↓
/readyz check inside backend container
```

## Access from your LAN

Find the VM private IP:

```bash
ip addr
```

If the VM IP is `192.168.1.50`, open:

```text
http://192.168.1.50:3000
```

Expected Docker mapping:

```text
0.0.0.0:3000->8080/tcp
```

The frontend Nginx container proxies `/api`, `/status`, `/healthz`, and `/readyz` to the backend internally.

Do not expose PostgreSQL 5432, Redis 6379, or backend 8080 to the LAN.

## Ubuntu firewall

If UFW is enabled:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw enable
sudo ufw status
```

You do not need ports 80/443 for this private-LAN setup.

## Verify deployment

On the VM:

```bash
docker compose --env-file /opt/pulse-check/.env.production -f docker-compose.prod.yml ps
curl http://127.0.0.1:3000/readyz
```

Expected response:

```json
{"status":"ok"}
```

Then test from another device on the same LAN with `http://VM_PRIVATE_IP:3000`.

## Rollback

Keep rollback simple: revert the problematic commit, push the revert to `main`, let CI pass, then the self-hosted runner redeploys the known-good code.

PostgreSQL and Redis data are stored in named Docker volumes and survive normal deploys.

## Later public access

If you later want public access, add it separately using router port forwarding + Caddy/domain, Cloudflare Tunnel, or a public VPS.
