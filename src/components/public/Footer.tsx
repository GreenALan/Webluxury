import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="border-t border-line mt-16 py-10 text-center text-xs text-ink-soft tracking-wide">
      <div className="container mx-auto px-4">
        <p>{t('copyright')}</p>
        <p className="mt-2">
          <a
            href="https://beian.miit.gov.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            ICP 备案号占位
          </a>
        </p>
      </div>
    </footer>
  );
}
