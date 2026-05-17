'use client';

const KEY = 'lr_favorites';
const EVENT = 'lr:favorites-change';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    if (ids.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, ids.join(','));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // localStorage 不可用（隐私模式等）直接忽略
  }
}

export function getFavorites(): string[] {
  return read();
}

export function isFavorite(id: string): boolean {
  return read().includes(id);
}

export function toggleFavorite(id: string): boolean {
  const cur = read();
  const idx = cur.indexOf(id);
  if (idx >= 0) {
    cur.splice(idx, 1);
    write(cur);
    return false;
  }
  cur.push(id);
  write(cur);
  return true;
}

export function clearFavorites(): void {
  write([]);
}

export function setFavorites(ids: string[]): void {
  write(ids);
}

export function onFavoritesChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
