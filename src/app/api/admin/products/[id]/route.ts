import { NextResponse } from 'next/server';
import { getProductDetail } from '@/lib/products';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const product = await getProductDetail(id);
  if (!product) {
    return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, product });
}
