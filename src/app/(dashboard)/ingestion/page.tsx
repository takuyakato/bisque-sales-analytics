import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function IngestionTopPage() {
  const supabase = createServiceClient();

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const { data: recent } = await supabase
    .from('ingestion_log')
    .select('id, platform, source, status, started_at, records_inserted, records_updated, records_skipped')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false });

  const statusCount = { success: 0, partial: 0, failed: 0 };
  for (const r of recent ?? []) {
    statusCount[r.status as keyof typeof statusCount] =
      (statusCount[r.status as keyof typeof statusCount] ?? 0) + 1;
  }

  // 未紐付け variants
  const { count: unlinkedVariants } = await supabase
    .from('product_variants')
    .select('*', { count: 'exact', head: true })
    .is('work_id', null);

  // auto-created works
  const { count: autoWorks } = await supabase
    .from('works')
    .select('*', { count: 'exact', head: true })
    .eq('auto_created', true);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="直近24h 成功" value={String(statusCount.success)} />
        <Card label="直近24h 部分成功" value={String(statusCount.partial)} accent={statusCount.partial > 0 ? 'yellow' : undefined} />
        <Card label="直近24h 失敗" value={String(statusCount.failed)} accent={statusCount.failed > 0 ? 'red' : undefined} />
        <Card label="未紐付けSKU" value={String(unlinkedVariants ?? 0)} sub={`/variants で整理`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card label="確認待ち作品 (auto_created)" value={String(autoWorks ?? 0)} sub={`/works?auto=true で確認`} />
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">自動実行スケジュール</h3>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>DLsite 日次スクレイピング: JST 05:00</li>
            <li>Fanza 日次スクレイピング: JST 05:15</li>
            <li>Notion 同期: JST 05:45（Vercel Cron）</li>
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">直近24時間の取込ログ（最新10件）</h2>
          <Link href="/ingestion/history" className="text-xs text-blue-600 hover:underline">
            すべて見る →
          </Link>
        </div>
        <table className="w-full text-xs">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="text-left py-2">開始時刻</th>
              <th className="text-left py-2">プラットフォーム</th>
              <th className="text-left py-2">ソース</th>
              <th className="text-center py-2">ステータス</th>
              <th className="text-right py-2">I/U/S</th>
            </tr>
          </thead>
          <tbody>
            {(recent ?? []).slice(0, 10).map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-2">{new Date(r.started_at).toLocaleString('ja-JP')}</td>
                <td className="py-2">{r.platform}</td>
                <td className="py-2 text-gray-500">{r.source}</td>
                <td className="py-2 text-center">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 text-right font-mono text-gray-600">
                  {r.records_inserted}/{r.records_updated}/{r.records_skipped}
                </td>
              </tr>
            ))}
            {(!recent || recent.length === 0) && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  直近24時間の記録なし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'red' | 'yellow' }) {
  const bg = accent === 'red' ? 'bg-red-50 border-red-200' : accent === 'yellow' ? 'bg-yellow-50 border-yellow-200' : 'bg-white';
  return (
    <div className={`rounded-lg shadow p-4 border ${bg}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-100 text-green-800',
    partial: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${map[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}
