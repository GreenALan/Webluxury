import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { LanguageSwitch } from './LanguageSwitch';

export function Header() {
  const t = useTranslations();
  const locale = useLocale();
  const link = (p: string) => `/${locale}${p}`;

  return (
    <header className="sticky top-0 z-40 bg-bone/95 backdrop-blur border-b border-line">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href={link('')} className="font-serif text-lg tracking-wider">
          {t('site.name')}
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm tracking-wide">
          <Link href={link('/products')}>{t('nav.products')}</Link>
          <Link href={link('/favorites')}>{t('nav.favorites')}</Link>
          <Link href={link('/about')}>{t('nav.about')}</Link>
          <Link href={link('/contact')}>{t('nav.contact')}</Link>
        </nav>
        <LanguageSwitch />
      </div>
    </header>
  );
}
