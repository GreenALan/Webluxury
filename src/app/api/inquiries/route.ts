import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createInquiry, hashIp } from '@/lib/inquiries';
import { inquiryLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  contact: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1000),
  locale: z.enum(['zh', 'en']),
  productId: z
    .string()
    .regex(/^c[a-z0-9]{20,}$/i)
    .optional()
    .nullable()
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }

  if (parsed.productId) {
    const product = await prisma.product.findUnique({
      where: { id: parsed.productId },
      select: { id: true, status: true }
    });
    if (!product || product.status !== 'AVAILABLE') {
      return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
    }
  }

  if (!inquiryLimiter.check(ip)) {
    logger.warn({ ip }, 'inquiry rate limited');
    return NextResponse.json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
  }

  try {
    const row = await createInquiry({
      name: parsed.name,
      contact: parsed.contact,
      message: parsed.message,
      locale: parsed.locale,
      productId: parsed.productId ?? null,
      ipHash: hashIp(ip)
    });
    logger.info({ id: row.id, productId: row.productId }, 'inquiry created');
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'create inquiry failed');
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
