import { Prisma, type ProductStatus } from '@prisma/client';
import { prisma } from './prisma';

export type ProductListFilter = {
  status?: ProductStatus | 'ALL';
  brand?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listProductsAdmin(filter: ProductListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const where: Prisma.ProductWhereInput = {};
  if (filter.status && filter.status !== 'ALL') where.status = filter.status;
  if (filter.brand) where.brand = filter.brand;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.search) {
    where.OR = [
      { titleZh: { contains: filter.search, mode: 'insensitive' } },
      { titleEn: { contains: filter.search, mode: 'insensitive' } },
      { serialNumber: { contains: filter.search, mode: 'insensitive' } }
    ];
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { slug: true, nameZh: true, nameEn: true } },
        images: { where: { kind: 'PHOTO' }, orderBy: { sortOrder: 'asc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.product.count({ where })
  ]);
  return { items, total, page, pageSize };
}

export async function getProductDetail(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
      uploadedBy: { select: { id: true, name: true, email: true } }
    }
  });
}
