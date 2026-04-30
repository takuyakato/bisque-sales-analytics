import { getKpiData } from '@/lib/queries/dashboard';

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function pct(curr: number, base: number): string {
  if (!base) return '—';
  const diff = ((curr - base) / base) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
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
  const data = await getKpiData();
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
          value={fmt(data.expectedMonthEndJpy)}
          sub={`前月: ${fmt(data.lastMonthJpy)} (${pct(data.expectedMonthEndJpy, data.lastMonthJpy)})`}
        />
      </div>
    </>
  );
}
