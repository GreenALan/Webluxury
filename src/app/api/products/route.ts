import { NextResponse } from 'next/server';
import { listPublicProducts, getPublicProductsByIds } from '@/lib/products';

function toPosInt(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toNonNegNumber(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function serialize(p: {
  id: string;
  slug: string;
  titleZh: string;
  titleEn: string | null;
  brand: string;
  price: { toString(): string };
  originalPrice: { toString(): string } | null;
  currency: string;
  condition: string;
  status: string;
  createdAt: Date;
  category: { slug: string; nameZh: string; nameEn: string };
  images: Array<{ url: string }>;
}) {
  return {
    id: p.id,
    slug: p.slug,
    titleZh: p.titleZh,
    titleEn: p.titleEn,
    brand: p.brand,
    price: p.price.toString(),
    originalPrice: p.originalPrice?.toString() ?? null,
    currency: p.currency,
    condition: p.condition,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    category: p.category,
    image: p.images[0]?.url ?? null
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  if (idsParam !== null) {
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rows = await getPublicProductsByIds(ids);
    return NextResponse.json({ ok: true, items: rows.map(serialize) });
  }

  const page = toPosInt(url.searchParams.get('page'), 1);
  const pageSize = toPosInt(url.searchParams.get('pageSize'), 12);
  const result = await listPublicProducts({
    categorySlug: url.searchParams.get('category') ?? undefined,
    brand: url.searchParams.get('brand') ?? undefined,
    minPrice: toNonNegNumber(url.searchParams.get('minPrice')),
    maxPrice: toNonNegNumber(url.searchParams.get('maxPrice')),
    page,
    pageSize
  });
  return NextResponse.json({
    ok: true,
    items: result.items.map(serialize),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize
  });
}
