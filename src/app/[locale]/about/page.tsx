import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAllSettings } from '@/lib/settings';
import { LocaleLink } from '@/components/public/LocaleLink';
import type { Locale } from '@/i18n/config';

export default async function AboutPage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public.about');
  const settings = await getAllSettings();
  const trust = t.raw('trust') as string[];

  return (
    <article className="container mx-auto px-4 py-10 md:py-16 max-w-2xl">
      <h1 className="font-serif text-3xl md:text-4xl">{t('title')}</h1>
      <p className="mt-4 text-ink-soft leading-relaxed">{t('intro')}</p>

      <h2 className="font-serif text-xl mt-10">{t('trustTitle')}</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {trust.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-accent">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {(settings.contact_phone || settings.contact_wechat_id) && (
        <div className="mt-10 border-t border-line pt-6 text-sm">
          {settings.contact_phone && (
            <p>
              <span className="text-ink-soft mr-2">Tel.</span>
              {settings.contact_phone}
            </p>
          )}
          {settings.contact_wechat_id && (
            <p className="mt-1">
              <span className="text-ink-soft mr-2">WeChat.</span>
              {settings.contact_wechat_id}
            </p>
          )}
          <LocaleLink href="/contact" className="inline-block mt-4 text-xs tracking-widest uppercase text-accent">
            → contact
          </LocaleLink>
        </div>
      )}
    </article>
  );
}
