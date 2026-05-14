import { NextResponse } from 'next/server';
import { listProductsAdmin } from '@/lib/products';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') ?? 'ALL') as never;
  const result = await listProductsAdmin({
    status,
    brand: url.searchParams.get('brand') ?? undefined,
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    page: Number(url.searchParams.get('page') ?? '1'),
    pageSize: Number(url.searchParams.get('pageSize') ?? '20')
  });
  return NextResponse.json({ ok: true, ...result });
}
