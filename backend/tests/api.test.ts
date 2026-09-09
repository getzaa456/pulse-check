import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { Database } from '../src/db.js';

describe('API', () => {
  it('returns liveness without dependencies', async () => {
    const db = { ping: vi.fn() } as unknown as Database;
    const app = createApp(db, { JWT_SECRET: 'a-secret-with-enough-characters' });
    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns degraded readiness when database is unavailable', async () => {
    const db = { ping: vi.fn().mockRejectedValue(new Error('down')) } as unknown as Database;
    const app = createApp(db, { JWT_SECRET: 'a-secret-with-enough-characters' });
    const response = await request(app).get('/readyz');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded' });
  });
});
