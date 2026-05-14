import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const CreateBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  nameZh: z.string().min(1).max(60),
  nameEn: z.string().min(1).max(60),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  return NextResponse.json({ ok: true, categories });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  try {
    const category = await prisma.category.create({ data: parsed });
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ ok: false, code: 'DUPLICATE_SLUG' }, { status: 409 });
    }
    throw e;
  }
}
