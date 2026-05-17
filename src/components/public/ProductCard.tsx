import Image from 'next/image';
import { useLocale } from 'next-intl';
import { LocaleLink } from './LocaleLink';
import { PriceTag } from './PriceTag';
import { pickLocalized } from '@/lib/format';

export type ProductCardData = {
  slug: string;
  titleZh: string;
  titleEn: string | null;
  brand: string;
  price: string | number;
  originalPrice?: string | number | null;
  image: string | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const locale = useLocale();
  const title = pickLocalized(product.titleZh, product.titleEn, locale);
  return (
    <LocaleLink
      href={`/products/${product.slug}`}
      className="group block"
      aria-label={title}
    >
      <div className="relative aspect-square bg-bone-dark overflow-hidden">
        {product.image ? (
          <Image
            src={product.image}
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-soft">
            no image
          </div>
        )}
      </div>
      <div className="mt-2 space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-ink-soft">{product.brand}</div>
        <div className="text-sm leading-snug line-clamp-2">{title}</div>
        <PriceTag price={product.price} originalPrice={product.originalPrice} />
      </div>
    </LocaleLink>
  );
}
