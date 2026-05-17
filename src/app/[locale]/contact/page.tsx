import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAllSettings } from '@/lib/settings';
import { ContactCard } from '@/components/public/ContactCard';
import type { Locale } from '@/i18n/config';

export default async function ContactPage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public.contact');
  const s = await getAllSettings();
  return (
    <section className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">
      <h1 className="font-serif text-3xl md:text-4xl">{t('title')}</h1>
      <p className="mt-3 text-ink-soft">{t('subtitle')}</p>
      <div className="mt-8">
        <ContactCard
          phone={s.contact_phone || undefined}
          wechatId={s.contact_wechat_id || undefined}
          wechatQrUrl={s.contact_wechat_qr_url || undefined}
        />
      </div>
      <p className="mt-10 text-xs text-ink-soft border-t border-line pt-4">{t('formNote')}</p>
    </section>
  );
}
