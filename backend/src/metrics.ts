import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import type { Database } from './db.js';

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'pulse_check_',
});

const httpRequests = new Counter({
  name: 'pulse_check_http_requests_total',
  help: 'Total HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

const httpRequestDuration = new Histogram({
  name: 'pulse_check_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const monitorStates = new Gauge({
  name: 'pulse_check_monitors',
  help: 'Number of enabled monitors grouped by current state',
  labelNames: ['state'] as const,
  registers: [metricsRegistry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/metrics') return next();

  const endTimer = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const routePath =
      typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = {
      method: req.method,
      route: routePath,
      status_code: String(res.statusCode),
    };

    httpRequests.inc(labels);
    endTimer(labels);
  });

  return next();
}

export async function refreshMonitorMetrics(db: Database): Promise<void> {
  const counts = await db.monitorStateCounts();

  monitorStates.reset();
  monitorStates.set({ state: 'UP' }, counts.UP);
  monitorStates.set({ state: 'DOWN' }, counts.DOWN);
  monitorStates.set({ state: 'UNKNOWN' }, counts.UNKNOWN);
}
