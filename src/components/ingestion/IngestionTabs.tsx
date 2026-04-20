'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/ingestion', label: 'トップ' },
  { href: '/ingestion/history', label: '履歴' },
  { href: '/ingestion/upload', label: 'CSVアップロード' },
  { href: '/ingestion/trigger', label: '手動実行' },
];

export function IngestionTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-gray-200 mb-6">
      {TABS.map((t) => {
        const active =
          t.href === '/ingestion' ? pathname === '/ingestion' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 text-sm transition border-b-2 -mb-px ${
              active
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
