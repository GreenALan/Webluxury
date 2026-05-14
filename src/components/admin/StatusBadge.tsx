import type { ProductStatus } from '@prisma/client';

const COLORS: Record<ProductStatus, string> = {
  DRAFT: 'bg-bone-dark text-ink-soft',
  AVAILABLE: 'bg-green-100 text-green-800',
  RESERVED: 'bg-amber-100 text-amber-800',
  SOLD: 'bg-ink text-bone',
  ARCHIVED: 'bg-line text-ink-soft'
};

const LABELS: Record<ProductStatus, string> = {
  DRAFT: '草稿',
  AVAILABLE: '在售',
  RESERVED: '保留',
  SOLD: '售出',
  ARCHIVED: '归档'
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs tracking-wider ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
