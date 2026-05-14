import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(60).optional()
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
  try {
    const user = await prisma.adminUser.update({
      where: { id },
      data: parsed,
      select: { id: true, email: true, name: true, role: true }
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
