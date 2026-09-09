# Prometheus + Grafana

Pulse Check uses Prometheus for metrics collection and Grafana for visualization.

## Services

- Prometheus scrapes `app:8080/metrics` every 15 seconds.
- Grafana reads from Prometheus over the Docker network.
- Grafana is exposed on host/LAN port `3001` by default.
- Prometheus is not exposed to the LAN by default.

## Backend metrics

The backend exposes:

- `pulse_check_http_requests_total`
- `pulse_check_http_request_duration_seconds`
- `pulse_check_monitors{state="UP|DOWN|UNKNOWN"}`
- default Node.js/process metrics with the `pulse_check_` prefix

## Grafana

Open locally:

```text
http://localhost:3001
```

On the Ubuntu VM LAN:

```text
http://VM_PRIVATE_IP:3001
```

The `Pulse Check Overview` dashboard is provisioned automatically and includes:

- request rate
- 5xx error rate
- p95 request latency
- monitor state counts

For local Docker Compose the default Grafana credentials are `admin` / `admin` unless overridden with environment variables.

For production, set `GRAFANA_ADMIN_PASSWORD` in `/opt/pulse-check/.env.production`.
