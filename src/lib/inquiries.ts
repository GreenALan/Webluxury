import { createHash } from 'node:crypto';
import { Prisma, type InquiryStatus } from '@prisma/client';
import { prisma } from './prisma';

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export type CreateInquiryInput = {
  name: string;
  contact: string;
  message: string;
  locale: 'zh' | 'en';
  productId: string | null;
  ipHash: string;
};

export async function createInquiry(input: CreateInquiryInput) {
  return prisma.inquiry.create({
    data: {
      name: input.name,
      contact: input.contact,
      message: input.message,
      locale: input.locale,
      productId: input.productId,
      ipHash: input.ipHash
    }
  });
}

export type InquiryListFilter = {
  status?: InquiryStatus | 'ALL';
  page?: number;
  pageSize?: number;
};

export async function listInquiriesAdmin(filter: InquiryListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 30));
  const where: Prisma.InquiryWhereInput = {};
  if (filter.status && filter.status !== 'ALL') where.status = filter.status;
  const [items, total] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      include: {
        product: { select: { id: true, slug: true, titleZh: true, titleEn: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.inquiry.count({ where })
  ]);
  return { items, total, page, pageSize };
}

export async function markInquiryRead(id: string) {
  return prisma.inquiry.update({ where: { id }, data: { status: 'READ' } });
}

export async function removeInquiry(id: string): Promise<void> {
  await prisma.inquiry.delete({ where: { id } });
}
