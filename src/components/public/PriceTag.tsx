import { formatPriceCNY } from '@/lib/format';

type Props = {
  price: string | number;
  originalPrice?: string | number | null;
  size?: 'sm' | 'lg';
  className?: string;
};

export function PriceTag({ price, originalPrice, size = 'sm', className = '' }: Props) {
  const big = size === 'lg';
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span
        className={`tabular-nums ${big ? 'font-serif text-2xl' : 'text-sm'} text-ink`}
      >
        {formatPriceCNY(price)}
      </span>
      {originalPrice && Number(originalPrice) > Number(price) && (
        <span
          className={`tabular-nums line-through text-ink-soft ${big ? 'text-base' : 'text-xs'}`}
        >
          {formatPriceCNY(originalPrice)}
        </span>
      )}
    </div>
  );
}
