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

// ---------------- Public read helpers ----------------

export type PublicListFilter = {
  categorySlug?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
};

const PUBLIC_PAGE_SIZE = 12;

export async function listPublicProducts(filter: PublicListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filter.pageSize ?? PUBLIC_PAGE_SIZE));
  const where: Prisma.ProductWhereInput = { status: 'AVAILABLE' };
  if (filter.categorySlug) where.category = { slug: filter.categorySlug };
  if (filter.brand) where.brand = filter.brand;
  if (filter.minPrice != null || filter.maxPrice != null) {
    where.price = {
      ...(filter.minPrice != null ? { gte: new Prisma.Decimal(filter.minPrice) } : {}),
      ...(filter.maxPrice != null ? { lte: new Prisma.Decimal(filter.maxPrice) } : {})
    };
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

export async function getPublicProductBySlug(slug: string) {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: { select: { slug: true, nameZh: true, nameEn: true } },
      images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }
    }
  });
  if (!p || p.status !== 'AVAILABLE') return null;
  return p;
}

export async function getPublicProductsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, status: 'AVAILABLE' },
    include: {
      category: { select: { slug: true, nameZh: true, nameEn: true } },
      images: { where: { kind: 'PHOTO' }, orderBy: { sortOrder: 'asc' }, take: 1 }
    }
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((v): v is (typeof rows)[number] => Boolean(v));
}

export async function getFacets() {
  const [cats, brandRows] = await Promise.all([
    prisma.category.findMany({
      where: { products: { some: { status: 'AVAILABLE' } } },
      select: { slug: true, nameZh: true, nameEn: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { nameZh: 'asc' }]
    }),
    prisma.product.findMany({
      where: { status: 'AVAILABLE' },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' }
    })
  ]);
  return {
    categories: cats,
    brands: brandRows.map((r) => r.brand)
  };
}

export async function listLatestPublic(take = 8) {
  return prisma.product.findMany({
    where: { status: 'AVAILABLE' },
    include: {
      category: { select: { slug: true, nameZh: true, nameEn: true } },
      images: { where: { kind: 'PHOTO' }, orderBy: { sortOrder: 'asc' }, take: 1 }
    },
    orderBy: { createdAt: 'desc' },
    take
  });
}
