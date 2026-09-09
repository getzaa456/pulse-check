import { describe, expect, it } from 'vitest';

import { computeUptime, monitorInputSchema, validateTargetUrl } from '../src/monitor.js';

describe('monitor validation', () => {
  it('accepts supported monitor settings', () => {
    const result = monitorInputSchema.safeParse({
      name: 'Example',
      url: 'https://example.com/health',
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatusCode: 200,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    'http://localhost:8080',
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://192.168.1.2',
    'ftp://example.com/file',
  ])('rejects unsafe target %s', (target) => {
    expect(() => validateTargetUrl(target)).toThrow();
  });

  it('computes uptime percentage', () => {
    expect(computeUptime(['UP', 'UP', 'DOWN', 'UP'])).toBe(75);
    expect(computeUptime([])).toBe(0);
  });
});
