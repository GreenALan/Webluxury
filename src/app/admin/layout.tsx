import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root min-h-screen bg-white text-ink">{children}</div>;
}
