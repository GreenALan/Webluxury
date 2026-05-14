type Props = {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs tracking-wider">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1 border border-line disabled:opacity-30"
      >
        ←
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1 border border-line disabled:opacity-30"
      >
        →
      </button>
    </div>
  );
}
