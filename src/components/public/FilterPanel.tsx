'use client';
import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export type FilterFacets = {
  categories: Array<{ slug: string; nameZh: string; nameEn: string }>;
  brands: string[];
};

type Props = {
  facets: FilterFacets;
  initial: {
    category?: string;
    brand?: string;
    minPrice?: string;
    maxPrice?: string;
  };
  locale: 'zh' | 'en';
};

export function FilterPanel({ facets, initial, locale }: Props) {
  const t = useTranslations('public.list');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState(initial.category ?? '');
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [minPrice, setMinPrice] = useState(initial.minPrice ?? '');
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice ?? '');

  function apply() {
    const sp = new URLSearchParams();
    if (category) sp.set('category', category);
    if (brand) sp.set('brand', brand);
    if (minPrice) sp.set('minPrice', minPrice);
    if (maxPrice) sp.set('maxPrice', maxPrice);
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
    setOpen(false);
  }

  function reset() {
    setCategory('');
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
    startTransition(() => router.push(pathname));
    setOpen(false);
  }

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="space-y-4"
    >
      <label className="block text-xs tracking-widest uppercase text-ink-soft">
        {t('category')}
      </label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full border border-line px-3 py-2 text-sm bg-bone"
      >
        <option value="">{t('anyCategory')}</option>
        {facets.categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {locale === 'en' ? c.nameEn : c.nameZh}
          </option>
        ))}
      </select>

      <label className="block text-xs tracking-widest uppercase text-ink-soft">{t('brand')}</label>
      <select
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        className="w-full border border-line px-3 py-2 text-sm bg-bone"
      >
        <option value="">{t('anyBrand')}</option>
        {facets.brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs tracking-widest uppercase text-ink-soft">
            {t('minPrice')}
          </label>
          <input
            inputMode="numeric"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs tracking-widest uppercase text-ink-soft">
            {t('maxPrice')}
          </label>
          <input
            inputMode="numeric"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-ink text-bone py-2 text-xs tracking-widest uppercase disabled:opacity-50"
        >
          {t('apply')}
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-4 border border-line text-xs tracking-widest uppercase"
        >
          {t('reset')}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0 border border-line p-4 sticky top-20 self-start">
        <div className="text-xs uppercase tracking-widest text-ink-soft mb-3">{t('filter')}</div>
        {form}
      </aside>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center gap-2 border border-line px-3 py-2 text-xs tracking-widest uppercase"
      >
        {t('filter')}
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative ml-auto w-80 max-w-full bg-bone h-full p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase tracking-widest">{t('filter')}</span>
              <button onClick={() => setOpen(false)} className="text-lg leading-none">
                ×
              </button>
            </div>
            {form}
          </div>
        </div>
      )}
    </>
  );
}
