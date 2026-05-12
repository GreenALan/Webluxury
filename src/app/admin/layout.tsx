import './admin.css';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const user = session
    ? await prisma.adminUser.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, role: true }
      })
    : null;

  return (
    <div className="admin-root min-h-screen bg-white text-ink flex">
      {user && (
        <aside className="w-56 border-r border-line p-6 hidden md:block">
          <div className="font-serif text-lg mb-8">后台</div>
          <nav className="space-y-2 text-sm">
            <Link href="/admin" className="block py-1.5">
              仪表盘
            </Link>
            <Link href="/admin/products" className="block py-1.5 text-ink-soft">
              商品
            </Link>
            <Link href="/admin/inquiries" className="block py-1.5 text-ink-soft">
              询价
            </Link>
            <Link href="/admin/categories" className="block py-1.5 text-ink-soft">
              分类
            </Link>
            <Link href="/admin/users" className="block py-1.5 text-ink-soft">
              管理员
            </Link>
            <Link href="/admin/settings" className="block py-1.5 text-ink-soft">
              设置
            </Link>
          </nav>
          <form action="/api/admin/logout" method="post" className="mt-12">
            <button className="text-xs text-ink-soft hover:text-ink">登出</button>
          </form>
        </aside>
      )}
      <div className="flex-1 min-w-0">
        {user && (
          <header className="h-12 border-b border-line flex items-center justify-end px-6 text-xs text-ink-soft">
            {user.name} · {user.email}
          </header>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
