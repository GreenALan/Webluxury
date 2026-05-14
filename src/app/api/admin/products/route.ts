import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { listProductsAdmin } from '@/lib/products';
import { toSlug, ensureUniqueSlug } from '@/lib/slug';
import { readSessionFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

const ImageInput = z.object({
  key: z.string().min(1),
  publicUrl: z.string().min(1),
  kind: z.enum(['PHOTO', 'CERT'])
});

const Body = z.object({
  titleZh: z.string().min(1).max(120),
  titleEn: z.string().max(120).optional(),
  descZh: z.string().max(5000).optional(),
  descEn: z.string().max(5000).optional(),
  brand: z.string().min(1).max(60),
  categoryId: z.string().min(1),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  originalPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  currency: z.string().length(3).default('CNY'),
  condition: z.enum(['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR']),
  sizeInfo: z.record(z.string(), z.string()).optional(),
  serialNumber: z.string().max(120).optional(),
  status: z.enum(['DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED']).default('DRAFT'),
  images: z.array(ImageInput).max(15)
});

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

export async function POST(req: Request) {
  const session = await readSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  // Prefer Chinese title for slug (pinyin) — site primary market is China.
  // Falls back to English if Chinese empty.
  const base = toSlug(parsed.titleZh || parsed.titleEn || '');
  const slug = await ensureUniqueSlug(base, async (s) =>
    prisma.product.findUnique({ where: { slug: s }, select: { id: true } })
  );

  const product = await prisma.product.create({
    data: {
      slug,
      titleZh: parsed.titleZh,
      titleEn: parsed.titleEn,
      descZh: parsed.descZh,
      descEn: parsed.descEn,
      brand: parsed.brand,
      categoryId: parsed.categoryId,
      price: new Prisma.Decimal(parsed.price),
      originalPrice: parsed.originalPrice ? new Prisma.Decimal(parsed.originalPrice) : undefined,
      currency: parsed.currency,
      condition: parsed.condition,
      sizeInfo: parsed.sizeInfo,
      serialNumber: parsed.serialNumber,
      status: parsed.status,
      uploadedById: session.userId,
      images: {
        create: parsed.images.map((img, i) => ({
          url: img.publicUrl,
          kind: img.kind,
          sortOrder: i
        }))
      }
    },
    include: {
      images: true,
      category: { select: { slug: true, nameZh: true, nameEn: true } }
    }
  });
  return NextResponse.json({ ok: true, product }, { status: 201 });
}
