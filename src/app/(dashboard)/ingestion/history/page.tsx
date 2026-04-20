import { createServiceClient } from '@/lib/supabase/service';
import { RollbackButton } from './RollbackButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<{
  platform?: string;
  status?: string;
}>;

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = createServiceClient();

  let q = supabase
    .from('ingestion_log')
    .select('*')
    .order('started_at', { ascending: false });
  if (params.platform && params.platform !== 'all') q = q.eq('platform', params.platform);
  if (params.status && params.status !== 'all') q = q.eq('status', params.status);

  const { data: logs } = await q.limit(200);

  return (
    <div>
      <form className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">プラットフォーム</label>
          <select name="platform" defaultValue={params.platform ?? 'all'} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="all">すべて</option>
            <option value="dlsite">DLsite</option>
            <option value="fanza">Fanza</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ステータス</label>
          <select name="status" defaultValue={params.status ?? 'all'} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="all">すべて</option>
            <option value="success">success</option>
            <option value="partial">partial</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
          絞り込み
        </button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
            <tr>
              <th className="text-left p-2">開始時刻</th>
              <th className="text-left p-2">プラットフォーム</th>
              <th className="text-left p-2">ソース</th>
              <th className="text-left p-2">期間</th>
              <th className="text-center p-2">ステータス</th>
              <th className="text-right p-2">I</th>
              <th className="text-right p-2">U</th>
              <th className="text-right p-2">S</th>
              <th className="text-left p-2">エラー / スクショ</th>
              <th className="text-center p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((r) => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2">{new Date(r.started_at).toLocaleString('ja-JP')}</td>
                <td className="p-2">{r.platform}</td>
                <td className="p-2 text-gray-500">{r.source}</td>
                <td className="p-2 text-gray-600">
                  {r.target_date_from ?? '—'}
                  {r.target_date_to && r.target_date_to !== r.target_date_from ? ` 〜 ${r.target_date_to}` : ''}
                </td>
                <td className="p-2 text-center">
                  <StatusBadge status={r.status} />
                </td>
                <td className="p-2 text-right font-mono">{r.records_inserted}</td>
                <td className="p-2 text-right font-mono">{r.records_updated}</td>
                <td className="p-2 text-right font-mono">{r.records_skipped}</td>
                <td className="p-2 text-red-600 max-w-xs truncate" title={r.error_message ?? ''}>
                  {r.error_message ? r.error_message.slice(0, 60) : ''}
                </td>
                <td className="p-2 text-center">
                  {r.records_inserted + r.records_updated > 0 && (
                    <RollbackButton logId={r.id} />
                  )}
                </td>
              </tr>
            ))}
            {(!logs || logs.length === 0) && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-gray-400">
                  履歴なし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
