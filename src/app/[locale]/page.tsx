import { setRequestLocale } from 'next-intl/server';
import { getFacets, listLatestPublic } from '@/lib/products';
import { HomeHero } from '@/components/public/HomeHero';
import { CategoryGrid } from '@/components/public/CategoryGrid';
import { LatestStrip } from '@/components/public/LatestStrip';
import type { Locale } from '@/i18n/config';

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [facets, latest] = await Promise.all([getFacets(), listLatestPublic(8)]);
  return (
    <>
      <HomeHero />
      <CategoryGrid categories={facets.categories} />
      <LatestStrip
        items={latest.map((p) => ({
          slug: p.slug,
          titleZh: p.titleZh,
          titleEn: p.titleEn,
          brand: p.brand,
          price: p.price.toString(),
          originalPrice: p.originalPrice?.toString() ?? null,
          image: p.images[0]?.url ?? null
        }))}
      />
    </>
  );
}
