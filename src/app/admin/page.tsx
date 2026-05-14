import { prisma } from '@/lib/prisma';

export default async function AdminDashboardPage() {
  const [availableCount, draftCount, weekInquiriesCount, recentInquiries] = await Promise.all([
    prisma.product.count({ where: { status: 'AVAILABLE' } }),
    prisma.product.count({ where: { status: 'DRAFT' } }),
    prisma.inquiry.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    }),
    prisma.inquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { product: { select: { titleZh: true } } }
    })
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl">仪表盘</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-line p-6">
          <div className="text-xs uppercase tracking-wider text-ink-soft">在售商品</div>
          <div className="font-serif text-4xl mt-2">{availableCount}</div>
        </div>
        <div className="border border-line p-6">
          <div className="text-xs uppercase tracking-wider text-ink-soft">草稿</div>
          <div className="font-serif text-4xl mt-2">{draftCount}</div>
        </div>
        <div className="border border-line p-6">
          <div className="text-xs uppercase tracking-wider text-ink-soft">本周询价</div>
          <div className="font-serif text-4xl mt-2">{weekInquiriesCount}</div>
        </div>
      </div>
      <div className="border border-line">
        <div className="border-b border-line px-4 py-2 text-xs uppercase tracking-wider">
          最新询价
        </div>
        <ul>
          {recentInquiries.map((i) => (
            <li key={i.id} className="border-b border-line last:border-0 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span>
                  <strong>{i.name}</strong> · {i.contact}
                </span>
                <span className="text-xs text-ink-soft">
                  {new Date(i.createdAt).toISOString().slice(0, 10)}
                </span>
              </div>
              {i.product?.titleZh && (
                <div className="text-xs text-ink-soft">询问: {i.product.titleZh}</div>
              )}
              <div className="mt-1 text-ink-soft">{i.message}</div>
            </li>
          ))}
          {recentInquiries.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-soft">暂无询价</li>
          )}
        </ul>
      </div>
    </div>
  );
}
