import { isIP } from 'node:net';
import { z } from 'zod';

export const monitorInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url(),
  intervalSeconds: z.union([z.literal(60), z.literal(300), z.literal(600)]),
  timeoutMs: z.number().int().min(100).max(30_000),
  expectedStatusCode: z.number().int().min(100).max(599),
  enabled: z.boolean().default(true),
});

export type MonitorInput = z.infer<typeof monitorInputSchema>;

export function validateTargetUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('only http and https targets are allowed');
  }

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('local targets are not allowed');
  }

  if (isIP(host) && isPrivateIp(host)) {
    throw new Error('private or local target IP is not allowed');
  }

  return url;
}

function isPrivateIp(ip: string): boolean {
  if (
    ip === '::1' ||
    ip === '::' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  ) {
    return true;
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;

  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

export function computeUptime(statuses: string[]): number {
  if (statuses.length === 0) return 0;
  return (statuses.filter((status) => status === 'UP').length / statuses.length) * 100;
}
