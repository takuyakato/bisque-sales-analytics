import { getKpiData } from '@/lib/queries/dashboard';
import { ErrorMessage } from './Skeletons';

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function pct(curr: number, base: number): string {
  if (!base) return '—';
  const diff = ((curr - base) / base) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

function freshnessLabel(freshness: Awaited<ReturnType<typeof getKpiData>>['freshness']): string {
  const date = (value: string | null) => value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : '—';
  return `反映済: DLsite ${date(freshness.dlsite)}・Fanza ${date(freshness.fanza)}・YouTube ${date(freshness.youtube)}`;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export async function KpiSection() {
  let data;
  try {
    data = await getKpiData();
  } catch (e) {
    console.error('KpiSection error:', e);
    return <ErrorMessage section="KPI" message={e instanceof Error ? e.message : undefined} />;
  }
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">ダッシュボード</h1>
        <p className="text-xs md:text-sm text-gray-500">
          直近30日（{data.period.from} 〜 {data.period.to}）の速報
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <KpiCard
          label="直近30日"
          value={fmt(data.last30dJpy)}
          sub={`前30日: ${fmt(data.prev30dJpy)} (${pct(data.last30dJpy, data.prev30dJpy)})`}
        />
        <KpiCard
          label="今月累計"
          value={fmt(data.thisMonthJpy)}
          sub={`前月同日まで: ${fmt(data.prevMonthUntilSameDayJpy)} (${pct(data.thisMonthJpy, data.prevMonthUntilSameDayJpy)})`}
        />
        <KpiCard
          label="今月着地見込み"
          value={data.expectedMonthEndJpy === null ? '—' : fmt(data.expectedMonthEndJpy)}
          sub={data.expectedMonthEndJpy === null
            ? 'データ停止のため算出不可'
            : `前月: ${fmt(data.lastMonthJpy)} (${pct(data.expectedMonthEndJpy, data.lastMonthJpy)})`}
        />
      </div>
      <div className="-mt-4 mb-6 text-xs text-gray-500">
        <div>{freshnessLabel(data.freshness)}</div>
        {(['dlsite', 'fanza', 'youtube'] as const).filter((platform) => data.sla[platform] === 'warning').map((platform) => {
          const label = { dlsite: 'DLsite', fanza: 'Fanza', youtube: 'YouTube' }[platform];
          const age = data.freshness[platform]
            ? Math.round((Date.parse(`${data.period.to}T00:00:00Z`) - Date.parse(`${data.freshness[platform]}T00:00:00Z`)) / 86_400_000)
            : 0;
          return <span key={platform} className="inline-block mt-1 mr-1 rounded bg-amber-100 px-2 py-0.5 text-amber-800">{label}のデータが{age}日更新されていません</span>;
        })}
      </div>
    </>
  );
}
