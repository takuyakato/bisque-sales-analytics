#!/usr/bin/env tsx
/**
 * CAPURI 各作品の「初日 vs 2日目」売上比較
 *
 * ⚠ このファイルは元の調査スクリプトを誤って削除してしまったため、ファイル名から
 *   意図を推測して再構築したもの。元と挙動が異なる場合は調整してください。
 *
 * 目的：CAPURI（DLsite）の各作品について、日次（aggregation_unit='daily'）の
 *   最初の販売日（初日）と次の販売日（2日目）の sales_count / net_revenue_jpy を
 *   並べ、2日目/初日 の比率を出す。発売初日のスパイクと翌日の落ち込み、
 *   または初日 or 2日目が欠損している取り込み異常を発見するのに使う。
 *
 * 使い方:
 *   npx tsx scripts/check-capuri-day1-vs-day2.ts
 */
import { existsSync, readFileSync } from 'fs';
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();

  // 作品タイトル参照用（work_id → 表示名）
  const works = await fetchAllPages<{ id: string; title: string; slug: string | null }>(
    s,
    'works',
    (q) => q.select('id, title, slug').eq('brand', 'CAPURI')
  );
  const titleById = new Map(works.map((w) => [w.id, w.slug ?? w.title]));
  console.log(`CAPURI works: ${works.length}件`);

  // CAPURI の日次売上（横断VIEW経由。sales_daily.work_id/platform は Phase2 で DROP 済み）
  const sales = await fetchAllPages<{
    work_id: string | null;
    sale_date: string;
    sales_count: number | null;
    revenue_jpy: number | null;
  }>(
    s,
    'sales_unified_daily',
    (q) =>
      q
        .select('work_id, sale_date, sales_count, revenue_jpy')
        .eq('brand', 'CAPURI')
        .eq('platform', 'dlsite')
        .eq('aggregation_unit', 'daily')
  );

  // work_id × sale_date で集計（同日複数SKU/価格を合算）
  const byWork: Record<string, Record<string, { count: number; rev: number }>> = {};
  for (const r of sales) {
    if (!r.work_id) continue;
    byWork[r.work_id] ??= {};
    byWork[r.work_id][r.sale_date] ??= { count: 0, rev: 0 };
    byWork[r.work_id][r.sale_date].count += r.sales_count ?? 0;
    byWork[r.work_id][r.sale_date].rev += r.revenue_jpy ?? 0;
  }

  interface Row {
    title: string;
    day1: string;
    day2: string | null;
    c1: number;
    c2: number;
    r1: number;
    r2: number;
    ratio: number | null; // 2日目売上 / 初日売上
  }
  const rows: Row[] = [];
  for (const [workId, dateMap] of Object.entries(byWork)) {
    const dates = Object.keys(dateMap).sort();
    if (dates.length === 0) continue;
    const d1 = dates[0];
    const d2 = dates[1] ?? null;
    const day1 = dateMap[d1];
    const day2 = d2 ? dateMap[d2] : { count: 0, rev: 0 };
    rows.push({
      title: titleById.get(workId) ?? workId,
      day1: d1,
      day2: d2,
      c1: day1.count,
      c2: day2.count,
      r1: day1.rev,
      r2: day2.rev,
      ratio: day1.rev > 0 ? Math.round((day2.rev / day1.rev) * 1000) / 1000 : null,
    });
  }

  // 初日売上の大きい順
  rows.sort((a, b) => b.r1 - a.r1);

  console.log(`\n対象作品: ${rows.length}件（初日売上 降順）\n`);
  console.log('初日\t2日目\t初日数\t2日目数\t初日¥\t2日目¥\t2日目/初日\t作品');
  for (const r of rows) {
    console.log(
      `${r.day1}\t${r.day2 ?? '—'}\t${r.c1}\t${r.c2}\t${r.r1}\t${r.r2}\t` +
        `${r.ratio === null ? '—' : r.ratio}\t${r.title.slice(0, 40)}`
    );
  }

  // 異常候補（2日目データが無い／2日目が初日を超えている）を末尾に列挙
  const noDay2 = rows.filter((r) => r.day2 === null);
  const day2Higher = rows.filter((r) => r.ratio !== null && r.ratio > 1);
  console.log(`\n⚠ 2日目データなし: ${noDay2.length}件`);
  console.log(`⚠ 2日目 > 初日（スパイクが翌日にある／取り込み順異常の可能性）: ${day2Higher.length}件`);
})();
