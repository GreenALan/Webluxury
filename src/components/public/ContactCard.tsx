import Image from 'next/image';
import { useTranslations } from 'next-intl';

type Props = {
  phone?: string;
  wechatId?: string;
  wechatQrUrl?: string;
};

export function ContactCard({ phone, wechatId, wechatQrUrl }: Props) {
  const t = useTranslations('public.contact');
  const empty = !phone && !wechatId && !wechatQrUrl;
  if (empty) {
    return <p className="text-ink-soft text-sm">{t('noContact')}</p>;
  }
  return (
    <div className="grid md:grid-cols-2 gap-6 text-sm">
      <ul className="space-y-3">
        {phone && (
          <li>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{t('phone')}</div>
            <a href={`tel:${phone}`} className="font-serif text-2xl hover:text-accent">
              {phone}
            </a>
          </li>
        )}
        {wechatId && (
          <li>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{t('wechat')}</div>
            <div className="font-mono">{wechatId}</div>
          </li>
        )}
      </ul>
      {wechatQrUrl && (
        <div>
          <div className="text-xs uppercase tracking-widest text-ink-soft mb-2">{t('wechatQr')}</div>
          <div className="relative w-48 h-48 border border-line">
            <Image src={wechatQrUrl} alt={t('wechatQr')} fill sizes="192px" className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
