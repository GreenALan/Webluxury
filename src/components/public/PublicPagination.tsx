import { LocaleLink } from './LocaleLink';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;        // 不含 locale，例 "/products"
  searchParams: Record<string, string | undefined>;
};

function buildHref(
  pathname: string,
  base: Record<string, string | undefined>,
  page: number
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && k !== 'page') sp.set(k, v);
  }
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function PublicPagination({ page, pageSize, total, pathname, searchParams }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(pages, page + 1);
  return (
    <nav className="flex items-center justify-center gap-3 text-xs tracking-wider mt-8">
      {page > 1 ? (
        <LocaleLink
          href={buildHref(pathname, searchParams, prev)}
          className="px-3 py-1 border border-line hover:bg-bone-dark"
        >
          ←
        </LocaleLink>
      ) : (
        <span className="px-3 py-1 border border-line opacity-30">←</span>
      )}
      <span className="tabular-nums">
        {page} / {pages}
      </span>
      {page < pages ? (
        <LocaleLink
          href={buildHref(pathname, searchParams, next)}
          className="px-3 py-1 border border-line hover:bg-bone-dark"
        >
          →
        </LocaleLink>
      ) : (
        <span className="px-3 py-1 border border-line opacity-30">→</span>
      )}
    </nav>
  );
}
