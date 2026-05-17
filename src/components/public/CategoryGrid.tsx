import { useLocale, useTranslations } from 'next-intl';
import { LocaleLink } from './LocaleLink';

type Cat = { slug: string; nameZh: string; nameEn: string };

export function CategoryGrid({ categories }: { categories: Cat[] }) {
  const locale = useLocale();
  const t = useTranslations('public.home');
  if (categories.length === 0) return null;
  return (
    <section className="container mx-auto px-4 py-10">
      <h2 className="font-serif text-2xl mb-6">{t('categories')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((c) => (
          <LocaleLink
            key={c.slug}
            href={`/products?category=${encodeURIComponent(c.slug)}`}
            className="border border-line py-8 text-center hover:bg-bone-dark transition-colors"
          >
            <span className="text-sm tracking-wider">
              {locale === 'en' ? c.nameEn : c.nameZh}
            </span>
          </LocaleLink>
        ))}
      </div>
    </section>
  );
}
