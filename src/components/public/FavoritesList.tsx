'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProductCard, type ProductCardData } from './ProductCard';
import { getFavorites, setFavorites, clearFavorites, onFavoritesChange } from '@/lib/favorites';

type ApiResp = { ok: true; items: Array<ProductCardData & { id: string }> };

export function FavoritesList() {
  const t = useTranslations('public.favorites');
  const [items, setItems] = useState<Array<ProductCardData & { id: string }> | null>(null);
  const [pruned, setPruned] = useState(false);

  async function load() {
    const ids = getFavorites();
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    const res = await fetch(`/api/products?ids=${ids.map(encodeURIComponent).join(',')}`);
    const json = (await res.json()) as ApiResp;
    const returnedIds = new Set(json.items.map((i) => i.id));
    const missing = ids.filter((id) => !returnedIds.has(id));
    if (missing.length > 0) {
      setFavorites(ids.filter((id) => returnedIds.has(id)));
      setPruned(true);
    }
    setItems(json.items);
  }

  useEffect(() => {
    load();
    return onFavoritesChange(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items === null) {
    return <p className="text-center text-ink-soft py-10">…</p>;
  }
  if (items.length === 0) {
    return <p className="text-center text-ink-soft py-16">{t('empty')}</p>;
  }
  return (
    <>
      {pruned && (
        <p className="text-xs text-ink-soft border border-line px-3 py-2 mb-4">{t('removed')}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => {
            clearFavorites();
            setItems([]);
          }}
          className="text-xs tracking-widest uppercase text-ink-soft hover:text-ink"
        >
          {t('clearAll')}
        </button>
      </div>
    </>
  );
}
