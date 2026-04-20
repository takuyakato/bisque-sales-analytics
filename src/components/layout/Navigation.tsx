'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/reports', label: '月次レポート' },
  { href: '/platforms', label: 'プラットフォーム別' },
  { href: '/works', label: '作品' },
  { href: '/variants', label: 'SKU管理' },
  { href: '/ingestion', label: '取込管理' },
];

export function Navigation() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="text-sm font-bold text-gray-800">
          bisque-sales-analytics
        </Link>

        <nav className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                isActive(item.href)
                  ? 'bg-blue-100 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
