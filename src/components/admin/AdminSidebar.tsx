'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: '仪表盘', exact: true },
  { href: '/admin/products', label: '商品' },
  { href: '/admin/categories', label: '分类' },
  { href: '/admin/users', label: '管理员' },
  { href: '/admin/settings', label: '设置' }
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="space-y-2 text-sm">
      {ITEMS.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`block py-1.5 ${active ? 'text-ink' : 'text-ink-soft'}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
