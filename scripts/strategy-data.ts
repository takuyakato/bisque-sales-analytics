import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();

  // ========== 1. DLsite CAPURI/BerryFeel 言語別累計 ==========
  console.log('=== DLsite CAPURI/BerryFeel 言語別累計 ===');
  const dlsite = await fetchAllPages<{ brand: string; language: string; revenue_jpy: number | null; sales_count: number | null; sale_date: string }>(
    s,
    'sales_unified_daily',
    (q) => q.select('brand, language, revenue_jpy, sales_count, sale_date').eq('platform', 'dlsite').in('brand', ['CAPURI', 'BerryFeel'])
  );
  const byBrandLang: Record<string, Record<string, { rev: number; count: number }>> = {};
  for (const r of dlsite) {
    byBrandLang[r.brand] ??= {};
    byBrandLang[r.brand][r.language] ??= { rev: 0, count: 0 };
    byBrandLang[r.brand][r.language].rev += r.revenue_jpy ?? 0;
    byBrandLang[r.brand][r.language].count += r.sales_count ?? 0;
  }
  for (const [b, langs] of Object.entries(byBrandLang)) {
    console.log(`\n[${b}]`);
    const total = Object.values(langs).reduce((a, v) => a + v.rev, 0);
    const sorted = Object.entries(langs).sort((a, b) => b[1].rev - a[1].rev);
    for (const [lang, v] of sorted) {
      const pct = total ? ((v.rev / total) * 100).toFixed(1) : '0.0';
      console.log(`  ${lang}: ¥${v.rev.toLocaleString()} (${pct}%) / ${v.count.toLocaleString()}件`);
    }
    console.log(`  合計: ¥${total.toLocaleString()}`);
  }

  // ========== 2. 直近12ヶ月 月次×言語推移 ==========
  console.log('\n\n=== 直近12ヶ月 CAPURI+BerryFeel 月次×言語 ===');
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const fromStr = from.toISOString().slice(0, 10);
  const recent = dlsite.filter((r) => r.sale_date >= fromStr);
  const byMonthLang: Record<string, Record<string, number>> = {};
  for (const r of recent) {
    const ym = r.sale_date.slice(0, 7);
    byMonthLang[ym] ??= {};
    byMonthLang[ym][r.language] = (byMonthLang[ym][r.language] ?? 0) + (r.revenue_jpy ?? 0);
  }
  console.log('月\tja\ten\tzh-Hans\tzh-Hant\tko\t合計');
  for (const ym of Object.keys(byMonthLang).sort()) {
    const m = byMonthLang[ym];
    const total = Object.values(m).reduce((a, v) => a + v, 0);
    console.log(`${ym}\t${m['ja'] ?? 0}\t${m['en'] ?? 0}\t${m['zh-Hans'] ?? 0}\t${m['zh-Hant'] ?? 0}\t${m['ko'] ?? 0}\t${total}`);
  }

  // ========== 3. work単位で翻訳存在の有無と売上比較 ==========
  console.log('\n\n=== 作品別：JP売上 vs 翻訳合計売上 ===');
  const { data: variants } = await s
    .from('product_variants')
    .select('id, work_id, language, product_id, works!inner(brand)')
    .eq('platform', 'dlsite')
    .in('works.brand', ['CAPURI', 'BerryFeel']);

  interface Var { id: string; work_id: string | null; language: string; product_id: string }
  const vs = ((variants ?? []) as unknown as Var[]).filter((v) => !!v.work_id);
  const byWork: Record<string, { ja: string[]; other: string[]; jaRev: number; otherRev: number }> = {};
  for (const v of vs) {
    byWork[v.work_id!] ??= { ja: [], other: [], jaRev: 0, otherRev: 0 };
    if (v.language === 'ja') byWork[v.work_id!].ja.push(v.product_id);
    else byWork[v.work_id!].other.push(`${v.product_id}(${v.language})`);
  }

  // revenue per variant
  const { data: mv } = await s.from('work_revenue_summary').select('work_id, platform, revenue_all').eq('platform', 'dlsite');
  void mv;
  // variant-level revenue from sales_daily
  const sales = await fetchAllPages<{ variant_id: string; net_revenue_jpy: number | null }>(
    s, 'sales_daily', (q) => q.select('variant_id, net_revenue_jpy').in('variant_id', vs.map(v => v.id))
  );
  const salesByVariant: Record<string, number> = {};
  for (const s of sales) {
    if (!s.variant_id) continue;
    salesByVariant[s.variant_id] = (salesByVariant[s.variant_id] ?? 0) + (s.net_revenue_jpy ?? 0);
  }
  for (const v of vs) {
    const w = byWork[v.work_id!];
    const rev = salesByVariant[v.id] ?? 0;
    if (v.language === 'ja') w.jaRev += rev;
    else w.otherRev += rev;
  }

  const withTranslation = Object.entries(byWork).filter(([, w]) => w.ja.length > 0 && w.other.length > 0);
  const onlyJa = Object.entries(byWork).filter(([, w]) => w.ja.length > 0 && w.other.length === 0);

  console.log(`\n翻訳あり: ${withTranslation.length}作品 / 日本語のみ: ${onlyJa.length}作品`);

  const sumJa = withTranslation.reduce((a, [, w]) => a + w.jaRev, 0);
  const sumOther = withTranslation.reduce((a, [, w]) => a + w.otherRev, 0);
  console.log(`翻訳あり作品の売上合計: JP=¥${sumJa.toLocaleString()} / 翻訳=¥${sumOther.toLocaleString()}`);
  console.log(`翻訳uplift比率: ${sumJa ? ((sumOther / sumJa) * 100).toFixed(1) : 0}%（JP売上に対する翻訳版追加売上）`);

  const onlyJaRev = onlyJa.reduce((a, [, w]) => a + w.jaRev, 0);
  console.log(`日本語のみ作品の売上合計: ¥${onlyJaRev.toLocaleString()}`);

  // ========== 4. 翻訳あり作品の上位10 ==========
  console.log('\n=== 翻訳あり作品トップ10（翻訳売上順） ===');
  const ranked = withTranslation
    .map(([wid, w]) => ({ wid, ...w, totalOther: w.otherRev }))
    .sort((a, b) => b.totalOther - a.totalOther)
    .slice(0, 10);
  for (const r of ranked) {
    const ratio = r.jaRev ? (r.otherRev / r.jaRev) : 0;
    console.log(`  ${r.wid}: JP=¥${r.jaRev.toLocaleString()} / 翻訳=¥${r.otherRev.toLocaleString()} (${(ratio * 100).toFixed(0)}%) / 翻訳版: ${r.other.join(', ')}`);
  }

  // ========== 5. YouTube（BLsand）参考値 ==========
  console.log('\n\n=== YouTube (BLsand) 累計 × 言語（チャンネル単位） ===');
  const yt = await fetchAllPages<{ language: string; revenue_jpy: number | null; sale_date: string }>(
    s, 'sales_unified_daily', (q) => q.select('language, revenue_jpy, sale_date').eq('platform', 'youtube')
  );
  const ytByLang: Record<string, number> = {};
  for (const r of yt) ytByLang[r.language] = (ytByLang[r.language] ?? 0) + (r.revenue_jpy ?? 0);
  const ytTotal = Object.values(ytByLang).reduce((a, v) => a + v, 0);
  for (const [l, v] of Object.entries(ytByLang).sort((a, b) => b[1] - a[1])) {
    const pct = ytTotal ? ((v / ytTotal) * 100).toFixed(1) : '0.0';
    console.log(`  ${l}: ¥${v.toLocaleString()} (${pct}%)`);
  }
  console.log(`  合計: ¥${ytTotal.toLocaleString()}`);
})();
