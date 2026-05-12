import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type SessionPayload = {
  userId: string;
  role: 'OWNER' | 'ADMIN';
};

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET missing or too short (need >=32 bytes)');
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const exp = process.env.JWT_EXPIRES_IN ?? '7d';
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== 'string') return null;
    if (payload.role !== 'OWNER' && payload.role !== 'ADMIN') return null;
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'lr_session';
