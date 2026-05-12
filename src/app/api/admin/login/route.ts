import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signSession, SESSION_COOKIE } from '@/lib/auth';
import { loginLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200)
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }

  if (!loginLimiter.check(parsed.email)) {
    logger.warn({ email: parsed.email, ip }, 'login rate limited');
    return NextResponse.json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
  }

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.email } });
  if (!user || !(await verifyPassword(parsed.password, user.passwordHash))) {
    logger.info({ email: parsed.email, ip }, 'login failed');
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const token = await signSession({ userId: user.id, role: user.role });
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  });
  loginLimiter.reset(parsed.email);
  logger.info({ userId: user.id, ip }, 'login ok');
  return res;
}
