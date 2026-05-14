import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getProductDetail } from '@/lib/products';

export const runtime = 'nodejs';

const ImageInput = z.object({
  key: z.string().min(1),
  publicUrl: z.string().min(1),
  kind: z.enum(['PHOTO', 'CERT'])
});

const Body = z
  .object({
    titleZh: z.string().min(1).max(120),
    titleEn: z.string().max(120),
    descZh: z.string().max(5000),
    descEn: z.string().max(5000),
    brand: z.string().min(1).max(60),
    categoryId: z.string().min(1),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    originalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    condition: z.enum(['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR']),
    sizeInfo: z.record(z.string(), z.string()),
    serialNumber: z.string().max(120),
    images: z.array(ImageInput).max(15)
  })
  .partial();

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const product = await getProductDetail(id);
  if (!product) return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, product });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }

  const data: Prisma.ProductUpdateInput = {};
  if (parsed.titleZh !== undefined) data.titleZh = parsed.titleZh;
  if (parsed.titleEn !== undefined) data.titleEn = parsed.titleEn;
  if (parsed.descZh !== undefined) data.descZh = parsed.descZh;
  if (parsed.descEn !== undefined) data.descEn = parsed.descEn;
  if (parsed.brand !== undefined) data.brand = parsed.brand;
  if (parsed.categoryId !== undefined) data.category = { connect: { id: parsed.categoryId } };
  if (parsed.price !== undefined) data.price = new Prisma.Decimal(parsed.price);
  if (parsed.originalPrice !== undefined)
    data.originalPrice = new Prisma.Decimal(parsed.originalPrice);
  if (parsed.condition !== undefined) data.condition = parsed.condition;
  if (parsed.sizeInfo !== undefined) data.sizeInfo = parsed.sizeInfo;
  if (parsed.serialNumber !== undefined) data.serialNumber = parsed.serialNumber;

  try {
    if (parsed.images) {
      await prisma.$transaction([
        prisma.image.deleteMany({ where: { productId: id } }),
        prisma.product.update({
          where: { id },
          data: {
            ...data,
            images: {
              create: parsed.images.map((img, i) => ({
                url: img.publicUrl,
                kind: img.kind,
                sortOrder: i
              }))
            }
          }
        })
      ]);
    } else {
      await prisma.product.update({ where: { id }, data });
    }
    const product = await getProductDetail(id);
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
