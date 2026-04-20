import { createServiceClient } from '@/lib/supabase/service';
import { DailyTrendChart } from '@/components/charts/DailyTrendChart';
import { BarCompareChart } from '@/components/charts/BarCompareChart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

type PlatformKey = 'dlsite' | 'fanza' | 'youtube';

export default async function PlatformsPage() {
  const supabase = createServiceClient();

  // 直近 180 日（半年）を取得
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 180);
  const fromStr = from.toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from('sales_unified_daily')
    .select('sale_date, platform, language, revenue_jpy, sales_count, aggregation_unit')
    .gte('sale_date', fromStr)
    .order('sale_date', { ascending: true });

  // 月次推移（プラットフォーム別）
  const monthlyByPlatform = new Map<string, Record<PlatformKey, number>>();
  for (const r of rows ?? []) {
    const ym = String(r.sale_date).slice(0, 7);
    const entry = monthlyByPlatform.get(ym) ?? { dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as PlatformKey;
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      entry[p] += r.revenue_jpy ?? 0;
    }
    monthlyByPlatform.set(ym, entry);
  }
  const monthlySeries = Array.from(monthlyByPlatform.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({ date, dlsite: e.dlsite, fanza: e.fanza, youtube: e.youtube }));

  // 各プラットフォームの直近30日×言語別集計
  const from30 = new Date(today);
  from30.setDate(from30.getDate() - 30);
  const from30Str = from30.toISOString().slice(0, 10);

  const platformLang: Record<PlatformKey, Record<string, number>> = {
    dlsite: {},
    fanza: {},
    youtube: {},
  };
  let dlsiteTotal = 0, fanzaTotal = 0, youtubeTotal = 0;
  for (const r of rows ?? []) {
    if (r.sale_date < from30Str) continue;
    const p = r.platform as PlatformKey;
    if (p !== 'dlsite' && p !== 'fanza' && p !== 'youtube') continue;
    const v = r.revenue_jpy ?? 0;
    platformLang[p][r.language] = (platformLang[p][r.language] ?? 0) + v;
    if (p === 'dlsite') dlsiteTotal += v;
    if (p === 'fanza') fanzaTotal += v;
    if (p === 'youtube') youtubeTotal += v;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">プラットフォーム別分析</h1>
        <p className="text-sm text-gray-500 mt-1">直近180日の月次推移・直近30日の言語内訳</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Summary title="DLsite" total={dlsiteTotal} color="#2563eb" />
        <Summary title="Fanza" total={fanzaTotal} color="#dc2626" />
        <Summary title="YouTube" total={youtubeTotal} color="#ef4444" />
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">月次推移（プラットフォーム別、直近180日）</h2>
        <DailyTrendChart data={monthlySeries} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(['dlsite', 'fanza', 'youtube'] as const).map((p) => {
          const colors = p === 'dlsite' ? '#2563eb' : p === 'fanza' ? '#dc2626' : '#ef4444';
          const langColorMap: Record<string, string> = {
            ja: colors,
            en: '#f59e0b',
            'zh-Hant': '#10b981',
            'zh-Hans': '#8b5cf6',
            ko: '#ec4899',
            unknown: '#9ca3af',
          };
          return (
            <div key={p} className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">{p} 言語別（直近30日）</h2>
              <BarCompareChart data={platformLang[p]} colors={langColorMap} height={200} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ title, total, color }: { title: string; total: number; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="text-xs text-gray-500 mb-1">{title} 直近30日</div>
      <div className="text-2xl font-bold" style={{ color }}>
        {fmt(total)}
      </div>
    </div>
  );
}
