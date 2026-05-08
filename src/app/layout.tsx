import './globals.css';

export const metadata = {
  title: 'Luxury Resale',
  description: 'Curated pre-owned luxury'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
