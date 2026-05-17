import { useTranslations } from 'next-intl';
import { LocaleLink } from './LocaleLink';

export function HomeHero() {
  const t = useTranslations('public.home');
  return (
    <section className="container mx-auto px-4 py-16 md:py-28 text-center">
      <h1 className="font-serif text-4xl md:text-6xl tracking-wider">{t('heroTitle')}</h1>
      <p className="mt-4 text-ink-soft tracking-wide">{t('heroSub')}</p>
      <LocaleLink
        href="/products"
        className="inline-block mt-8 px-6 py-3 bg-ink text-bone text-xs tracking-widest uppercase hover:bg-accent"
      >
        {t('browseAll')}
      </LocaleLink>
    </section>
  );
}
