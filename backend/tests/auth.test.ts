import { describe, expect, it } from 'vitest';

import { hashPassword, issueToken, verifyPassword, verifyToken } from '../src/auth.js';

describe('auth', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('super-secure-password');
    expect(hash).not.toBe('super-secure-password');
    await expect(verifyPassword(hash, 'super-secure-password')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
  });

  it('issues and verifies JWTs', () => {
    const secret = 'a-secret-with-enough-characters';
    const token = issueToken(secret, 'user-123');
    expect(verifyToken(secret, token).sub).toBe('user-123');
    expect(() => verifyToken('another-long-secret-value', token)).toThrow();
  });
});
