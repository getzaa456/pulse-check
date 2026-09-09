import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { hashPassword, issueToken, verifyPassword, verifyToken } from './auth.js';
import type { Config } from './config.js';
import type { CheckResult, Database } from './db.js';
import { metricsMiddleware, metricsRegistry, refreshMonitorMetrics } from './metrics.js';
import { monitorInputSchema } from './monitor.js';

type AuthedRequest = Request & { userId?: string };

const statusPageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  published: z.boolean().default(true),
  monitorIds: z.array(z.string().uuid()).default([]),
});

export function createApp(db: Database, config: Pick<Config, 'JWT_SECRET'>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(metricsMiddleware);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await db.ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded' });
    }
  });

  app.get('/metrics', async (_req, res) => {
    await refreshMonitorMetrics(db);
    res.setHeader('content-type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  });

  app.post('/api/v1/auth/register', async (req, res) => {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(8).max(128) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message });

    try {
      const passwordHash = await hashPassword(parsed.data.password);
      const user = await db.createUser(parsed.data.email, passwordHash);
      return res.status(201).json({
        accessToken: issueToken(config.JWT_SECRET, user.id),
        user: { id: user.id, email: user.email, createdAt: user.createdAt },
      });
    } catch {
      return res.status(409).json({ error: 'email already registered' });
    }
  });

  app.post('/api/v1/auth/login', async (req, res) => {
    const parsed = z
      .object({ email: z.string().email(), password: z.string() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid request' });

    const user = await db.findUserByEmail(parsed.data.email);
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return res.status(401).json({ error: 'invalid email or password' });
    }

    return res.json({
      accessToken: issueToken(config.JWT_SECRET, user.id),
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  });

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'bearer token required' });
    }
    try {
      req.userId = verifyToken(config.JWT_SECRET, authorization.slice(7)).sub;
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };

  app.get('/api/v1/monitors', requireAuth, async (req: AuthedRequest, res) => {
    res.json(await db.listMonitors(req.userId!));
  });

  app.post('/api/v1/monitors', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = monitorInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message });
    try {
      const monitor = await db.createMonitor(req.userId!, parsed.data);
      return res.status(201).json(monitor);
    } catch {
      return res.status(500).json({ error: 'could not create monitor' });
    }
  });

  app.get('/api/v1/monitors/:id', requireAuth, async (req: AuthedRequest, res) => {
    const monitor = await db.getMonitor(req.userId!, String(req.params.id));
    return monitor ? res.json(monitor) : res.status(404).json({ error: 'monitor not found' });
  });

  app.put('/api/v1/monitors/:id', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = monitorInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message });
    const monitor = await db.updateMonitor(req.userId!, String(req.params.id), parsed.data);
    return monitor ? res.json(monitor) : res.status(404).json({ error: 'monitor not found' });
  });

  app.delete('/api/v1/monitors/:id', requireAuth, async (req: AuthedRequest, res) => {
    const deleted = await db.deleteMonitor(req.userId!, String(req.params.id));
    return deleted ? res.status(204).end() : res.status(404).json({ error: 'monitor not found' });
  });

  app.get('/api/v1/monitors/:id/checks', requireAuth, async (req: AuthedRequest, res) => {
    const monitor = await db.getMonitor(req.userId!, String(req.params.id));
    if (!monitor) return res.status(404).json({ error: 'monitor not found' });
    return res.json(await db.recentChecks(monitor.id, 100));
  });

  app.post('/api/v1/status-pages', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = statusPageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message });
    try {
      return res.status(201).json(await db.createStatusPage(req.userId!, parsed.data));
    } catch {
      return res.status(409).json({ error: 'could not create status page' });
    }
  });

  app.get('/api/v1/public/status/:slug', async (req, res) => {
    const status = await db.publicStatus(String(req.params.slug));
    return status ? res.json(status) : res.status(404).json({ error: 'status page not found' });
  });

  app.get('/status/:slug', async (req, res) => {
    const status = await db.publicStatus(String(req.params.slug));
    if (!status) return res.status(404).send('Status page not found');
    return res.type('html').send(renderStatusPage(status));
  });

  return app;
}

export function renderStatusPage(status: Awaited<ReturnType<Database['publicStatus']>>) {
  if (!status) return '';
  const monitors = status.monitors
    .map(
      (monitor) => `
      <section class="card">
        <strong>${escapeHtml(String(monitor.name))}</strong>
        <div class="${monitor.state}">${monitor.state}</div>
        <div>Recent uptime: ${Number(monitor.uptimePercentage).toFixed(2)}%</div>
        <small>Last checked: ${monitor.lastCheckedAt ?? 'never'}</small>
        <div class="bars">${monitor.recentResponseTimes
          .filter((check: CheckResult) => check.responseTimeMs !== null)
          .map((check: CheckResult) => {
            const height = Math.max(3, Math.min(100, Math.round((check.responseTimeMs ?? 0) / 10)));
            return `<span class="bar" title="${check.responseTimeMs} ms" style="height:${height}%"></span>`;
          })
          .join('')}</div>
      </section>`,
    )
    .join('');

  const incidents = status.incidents
    .map(
      (incident) =>
        `<div class="card">Monitor ${escapeHtml(String(incident.monitorId))} · started ${escapeHtml(String(incident.startedAt))} · resolved ${escapeHtml(String(incident.resolvedAt ?? 'ongoing'))}</div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(status.name)} Status</title><style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#0b1020;color:#e8ecf3}
.card{background:#151c31;border:1px solid #29334f;border-radius:14px;padding:18px;margin:12px 0}
.UP{color:#62d995}.DOWN{color:#ff6b7a}.UNKNOWN{color:#f1c75b}small{color:#9eabc3}
.bars{height:70px;display:flex;align-items:end;gap:3px;margin-top:14px}.bar{width:6px;min-height:3px;background:#6e8efb;border-radius:2px}
</style></head><body><h1>${escapeHtml(status.name)}</h1><p>Current service status</p>
${monitors || '<div class="card">No public monitors.</div>'}
<h2>Recent incidents</h2>${incidents || '<p>No incidents recorded.</p>'}</body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[char]!;
  });
}
