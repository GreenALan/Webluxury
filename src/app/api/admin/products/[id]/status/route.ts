import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma, type ProductStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  status: z.enum(['DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED'])
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const newStatus: ProductStatus = parsed.status;
  const data: Prisma.ProductUpdateInput = { status: newStatus };
  if (newStatus === 'SOLD') data.soldAt = new Date();
  else if (newStatus !== 'RESERVED') data.soldAt = null;

  try {
    const product = await prisma.product.update({
      where: { id },
      data,
      select: { id: true, status: true, soldAt: true }
    });
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
