import type { Locale } from '@/i18n/config';

export function formatPriceCNY(value: string | number | null | undefined): string {
  if (value == null) return '';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(n);
}

export function pickLocalized(
  zh: string,
  en: string | null | undefined,
  locale: Locale | string
): string {
  if (locale === 'en') return en && en.trim() ? en : zh;
  return zh;
}

export function formatDate(d: Date | string, locale: Locale | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}
