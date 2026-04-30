import Link from 'next/link';
import { getTopWorks } from '@/lib/queries/dashboard';

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

export async function TopWorksSection() {
  const topWorks = await getTopWorks();
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">トップ10作品（直近30日）</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="text-left py-2">#</th>
            <th className="text-left py-2">作品</th>
            <th className="text-left py-2">レーベル</th>
            <th className="text-right py-2">販売数</th>
            <th className="text-right py-2">売上</th>
          </tr>
        </thead>
        <tbody>
          {topWorks.map((w, i) => (
            <tr key={w.work_id} className="border-b border-gray-100">
              <td className="py-2 text-gray-500">{i + 1}</td>
              <td className="py-2">
                <Link href={`/works/${w.work_id}`} className="text-blue-600 hover:underline">
                  {w.slug ?? w.title}
                </Link>
              </td>
              <td className="py-2 text-gray-600">{w.brand}</td>
              <td className="py-2 text-right">{w.sales_count.toLocaleString()}</td>
              <td className="py-2 text-right font-semibold">{fmt(w.revenue_jpy)}</td>
            </tr>
          ))}
          {topWorks.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-gray-400">データなし</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
