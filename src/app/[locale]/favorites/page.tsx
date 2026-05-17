import { setRequestLocale, getTranslations } from 'next-intl/server';
import { FavoritesList } from '@/components/public/FavoritesList';
import type { Locale } from '@/i18n/config';

export default async function FavoritesPage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public.favorites');
  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl md:text-4xl mb-6">{t('title')}</h1>
      <FavoritesList />
    </section>
  );
}
