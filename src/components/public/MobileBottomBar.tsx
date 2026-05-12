'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

export function MobileBottomBar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const items = [
    { href: '', label: t('home') },
    { href: '/products', label: t('products') },
    { href: '/favorites', label: t('favorites') },
    { href: '/contact', label: t('contact') }
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bone border-t border-line">
      <ul className="grid grid-cols-4 text-xs tracking-wide">
        {items.map((it) => {
          const full = `/${locale}${it.href}`;
          const active = pathname === full || (it.href === '' && pathname === `/${locale}`);
          return (
            <li key={it.href}>
              <Link
                href={full}
                className={`flex flex-col items-center justify-center h-14 ${
                  active ? 'text-ink' : 'text-ink-soft'
                }`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
