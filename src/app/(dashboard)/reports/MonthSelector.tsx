'use client';

import { useRouter } from 'next/navigation';

export function MonthSelector({ current, months }: { current: string; months: string[] }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/reports?month=${e.target.value}`)}
      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
