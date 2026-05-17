'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isFavorite, toggleFavorite, onFavoritesChange } from '@/lib/favorites';

type Props = { productId: string; className?: string };

export function FavoriteButton({ productId, className = '' }: Props) {
  const t = useTranslations('public.detail');
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActive(isFavorite(productId));
    setReady(true);
    return onFavoritesChange(() => setActive(isFavorite(productId)));
  }, [productId]);

  function onClick() {
    const next = toggleFavorite(productId);
    setActive(next);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? t('unfavorite') : t('favorite')}
      className={`inline-flex items-center gap-2 border px-4 py-2 text-xs tracking-widest uppercase transition-colors ${
        active ? 'border-accent text-accent' : 'border-line text-ink-soft hover:text-ink'
      } ${className}`}
    >
      <span aria-hidden>{ready && active ? '♥' : '♡'}</span>
      <span>{active ? t('unfavorite') : t('favorite')}</span>
    </button>
  );
}
