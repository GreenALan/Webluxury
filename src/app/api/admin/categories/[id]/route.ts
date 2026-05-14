import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const UpdateBody = z.object({
  nameZh: z.string().min(1).max(60).optional(),
  nameEn: z.string().min(1).max(60).optional(),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = UpdateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  try {
    const category = await prisma.category.update({ where: { id }, data: parsed });
    return NextResponse.json({ ok: true, category });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const used = await prisma.product.count({ where: { categoryId: id } });
  if (used > 0) {
    return NextResponse.json(
      { ok: false, code: 'IN_USE', message: `${used} 个商品仍属于此分类` },
      { status: 409 }
    );
  }
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
