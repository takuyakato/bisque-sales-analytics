import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'bisque-sales-analytics',
  description: 'Bisque 売上データ集約・分析ダッシュボード',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
