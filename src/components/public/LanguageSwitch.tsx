'use client';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales } from '@/i18n/config';

export function LanguageSwitch() {
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(target: string) {
    if (target === current) return;
    const segs = pathname.split('/');
    segs[1] = target;
    router.push(segs.join('/') || `/${target}`);
  }

  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
      {locales.map((loc, i) => (
        <span key={loc} className="contents">
          <button
            type="button"
            onClick={() => switchTo(loc)}
            className={loc === current ? 'text-ink' : 'text-ink-soft hover:text-ink'}
            aria-current={loc === current ? 'true' : undefined}
          >
            {loc.toUpperCase()}
          </button>
          {i < locales.length - 1 && <span className="text-line">/</span>}
        </span>
      ))}
    </div>
  );
}
