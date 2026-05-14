import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  items: z
    .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(9999) }))
    .max(200)
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  await prisma.$transaction(
    parsed.items.map((it) =>
      prisma.category.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder } })
    )
  );
  return NextResponse.json({ ok: true });
}
