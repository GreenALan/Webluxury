import { setRequestLocale, getTranslations } from 'next-intl/server';
import { listPublicProducts, getFacets } from '@/lib/products';
import { ProductCard } from '@/components/public/ProductCard';
import { FilterPanel } from '@/components/public/FilterPanel';
import { PublicPagination } from '@/components/public/PublicPagination';
import type { Locale } from '@/i18n/config';

type Search = {
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  page?: string;
};

function toNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function ProductsListPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('public.list');

  const page = Math.max(1, Number(sp.page) || 1);
  const [result, facets] = await Promise.all([
    listPublicProducts({
      categorySlug: sp.category,
      brand: sp.brand,
      minPrice: toNum(sp.minPrice),
      maxPrice: toNum(sp.maxPrice),
      page,
      pageSize: 12
    }),
    getFacets()
  ]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      <header className="flex items-end justify-between mb-6">
        <h1 className="font-serif text-3xl md:text-4xl">{t('title')}</h1>
        <div className="text-xs text-ink-soft">
          {t('showing', { total: result.total })}
        </div>
      </header>

      <div className="md:flex md:gap-8">
        <FilterPanel
          facets={facets}
          initial={{
            category: sp.category,
            brand: sp.brand,
            minPrice: sp.minPrice,
            maxPrice: sp.maxPrice
          }}
          locale={locale}
        />
        <div className="md:flex-1 md:min-w-0 mt-4 md:mt-0">
          {result.items.length === 0 ? (
            <p className="text-center text-ink-soft py-16">{t('empty')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {result.items.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={{
                      slug: p.slug,
                      titleZh: p.titleZh,
                      titleEn: p.titleEn,
                      brand: p.brand,
                      price: p.price.toString(),
                      originalPrice: p.originalPrice?.toString() ?? null,
                      image: p.images[0]?.url ?? null
                    }}
                  />
                ))}
              </div>
              <div className="text-center text-xs text-ink-soft mt-6">
                {t('page', { page: result.page, pages })}
              </div>
              <PublicPagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                pathname="/products"
                searchParams={{
                  category: sp.category,
                  brand: sp.brand,
                  minPrice: sp.minPrice,
                  maxPrice: sp.maxPrice
                }}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
