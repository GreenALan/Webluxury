import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { markInquiryRead, removeInquiry } from '@/lib/inquiries';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await markInquiryRead(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    console.error('PATCH inquiry error', err);
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await removeInquiry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    console.error('DELETE inquiry error', err);
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
