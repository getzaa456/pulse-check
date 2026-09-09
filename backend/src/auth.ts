import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export type AuthClaims = {
  sub: string;
};

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function issueToken(secret: string, userId: string): string {
  return jwt.sign({}, secret, {
    subject: userId,
    expiresIn: '24h',
    algorithm: 'HS256',
  });
}

export function verifyToken(secret: string, token: string): AuthClaims {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub) {
    throw new Error('invalid token');
  }
  return { sub: decoded.sub };
}
