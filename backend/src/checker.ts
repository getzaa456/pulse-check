import { isIP } from 'node:net';
import { Resolver } from 'node:dns/promises';

import { validateTargetUrl } from './monitor.js';

export type CheckResult = {
  status: 'UP' | 'DOWN';
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  errorMessage: string;
};

const resolver = new Resolver();

function isPrivateAddress(ip: string): boolean {
  if (
    ip === '::1' ||
    ip === '::' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  ) {
    return true;
  }
  if (isIP(ip) !== 4) return false;
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

async function assertPublicDns(url: URL): Promise<void> {
  if (isIP(url.hostname)) return;
  const addresses = await resolver.resolve(url.hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error('target resolves to a private or local address');
  }
}

export async function checkTarget(
  rawUrl: string,
  timeoutMs: number,
  expectedStatusCode: number,
): Promise<CheckResult> {
  const started = performance.now();

  try {
    let current = validateTargetUrl(rawUrl);

    for (let redirects = 0; redirects <= 5; redirects += 1) {
      await assertPublicDns(current);

      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'PulseCheck/0.1' },
      });

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        if (redirects === 5) throw new Error('too many redirects');
        current = validateTargetUrl(new URL(response.headers.get('location')!, current).toString());
        continue;
      }

      await response.body?.cancel();
      const responseTimeMs = Math.round(performance.now() - started);
      return {
        status: response.status === expectedStatusCode ? 'UP' : 'DOWN',
        httpStatusCode: response.status,
        responseTimeMs,
        errorMessage: '',
      };
    }

    throw new Error('too many redirects');
  } catch (error) {
    return {
      status: 'DOWN',
      httpStatusCode: null,
      responseTimeMs: Math.round(performance.now() - started),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
