import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('site');
  return (
    <section className="container mx-auto px-4 py-24 text-center">
      <h1 className="font-serif text-5xl tracking-wider">{t('name')}</h1>
      <p className="mt-4 text-ink-soft">{t('tagline')}</p>
    </section>
  );
}
