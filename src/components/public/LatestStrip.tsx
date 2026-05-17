import { useTranslations } from 'next-intl';
import { ProductCard, type ProductCardData } from './ProductCard';
import { LocaleLink } from './LocaleLink';

export function LatestStrip({ items }: { items: ProductCardData[] }) {
  const t = useTranslations('public.home');
  if (items.length === 0) return null;
  return (
    <section className="container mx-auto px-4 py-10">
      <div className="flex items-end justify-between mb-6">
        <h2 className="font-serif text-2xl">{t('latest')}</h2>
        <LocaleLink href="/products" className="text-xs tracking-widest uppercase text-ink-soft">
          {t('viewAll')} →
        </LocaleLink>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible md:snap-none">
        {items.map((p) => (
          <div key={p.slug} className="w-56 shrink-0 snap-start md:w-auto">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
