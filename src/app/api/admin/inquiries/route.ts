import { NextResponse } from 'next/server';
import type { InquiryStatus } from '@prisma/client';
import { listInquiriesAdmin } from '@/lib/inquiries';

export const runtime = 'nodejs';

function toPosInt(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const STATUSES = new Set<InquiryStatus | 'ALL'>(['NEW', 'READ', 'REPLIED', 'ALL']);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawStatus = url.searchParams.get('status');
    const status =
      rawStatus && STATUSES.has(rawStatus as InquiryStatus | 'ALL')
        ? (rawStatus as InquiryStatus | 'ALL')
        : undefined;
    const page = toPosInt(url.searchParams.get('page'), 1);
    const pageSize = toPosInt(url.searchParams.get('pageSize'), 30);
    const result = await listInquiriesAdmin({ status, page, pageSize });
    return NextResponse.json({
      ok: true,
      items: result.items.map((i) => ({
        id: i.id,
        name: i.name,
        contact: i.contact,
        message: i.message,
        locale: i.locale,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        product: i.product
          ? { id: i.product.id, slug: i.product.slug, titleZh: i.product.titleZh, titleEn: i.product.titleEn }
          : null
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    });
  } catch (err) {
    console.error('GET /api/admin/inquiries error', err);
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
