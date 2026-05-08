import './globals.css';
import { Inter, Playfair_Display } from 'next/font/google';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const serif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap'
});

export const metadata = {
  title: 'Luxury Resale',
  description: 'Curated pre-owned luxury'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
