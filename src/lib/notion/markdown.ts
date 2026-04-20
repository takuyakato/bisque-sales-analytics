import type { MonthlyReportData } from '@/lib/queries/monthly-report';

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}
function pct(p: number | null): string {
  if (p === null) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

/**
 * 月次レポートを Markdown 形式に整形
 * Notion に貼り付けたり、他のツールにコピーできる
 */
export function renderMonthlyMarkdown(data: MonthlyReportData): string {
  const { month, summary, byBrand, byPlatform, byLanguage, dailyTable, topWorks } = data;

  const lines: string[] = [];
  lines.push(`# ${month} KPIレポート`);
  lines.push('');
  lines.push(`## 月次サマリ`);
  lines.push(`- **当月合計**: ${fmt(summary.totalJpy)}（${summary.salesCount.toLocaleString()} 件）`);
  lines.push(`- **前月比**: ${pct(summary.monthOverMonthPct)}（前月 ${fmt(summary.prevMonthTotalJpy)}）`);
  lines.push(`- **前年同月比**: ${pct(summary.yearOverYearPct)}（前年 ${fmt(summary.prevYearSameMonthJpy)}）`);
  lines.push('');

  lines.push(`## ブランド別`);
  lines.push('| ブランド | 売上 | 販売数 |');
  lines.push('|---|---:|---:|');
  for (const r of byBrand) lines.push(`| ${r.brand} | ${fmt(r.revenue)} | ${r.salesCount.toLocaleString()} |`);
  lines.push('');

  lines.push(`## プラットフォーム別`);
  lines.push('| プラットフォーム | 売上 | 販売数 |');
  lines.push('|---|---:|---:|');
  for (const r of byPlatform) lines.push(`| ${r.platform} | ${fmt(r.revenue)} | ${r.salesCount.toLocaleString()} |`);
  lines.push('');

  lines.push(`## 言語別`);
  lines.push('| 言語 | 売上 | 販売数 |');
  lines.push('|---|---:|---:|');
  for (const r of byLanguage) lines.push(`| ${r.language} | ${fmt(r.revenue)} | ${r.salesCount.toLocaleString()} |`);
  lines.push('');

  lines.push(`## 作品トップ10（当月売上順）`);
  lines.push('| # | 作品 | ブランド | 売上 | 販売数 |');
  lines.push('|---:|---|---|---:|---:|');
  topWorks.forEach((w, i) => {
    lines.push(`| ${i + 1} | ${w.slug ?? w.title} | ${w.brand} | ${fmt(w.revenue)} | ${w.salesCount.toLocaleString()} |`);
  });
  lines.push('');

  lines.push(`## 日次推移`);
  lines.push('| 日付 | DLsite | Fanza | YouTube | 合計 | 前日比 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const r of dailyTable) {
    lines.push(`| ${r.date} | ${fmt(r.dlsite)} | ${fmt(r.fanza)} | ${fmt(r.youtube)} | ${fmt(r.total)} | ${pct(r.prevDayPct)} |`);
  }

  return lines.join('\n');
}

/**
 * 月次レポートを CSV に整形（日次テーブル中心）
 */
export function renderMonthlyCsv(data: MonthlyReportData): string {
  const lines: string[] = [];
  lines.push('date,dlsite,fanza,youtube,total,prev_day_pct');
  for (const r of data.dailyTable) {
    lines.push(
      [r.date, r.dlsite, r.fanza, r.youtube, r.total, r.prevDayPct ?? ''].join(',')
    );
  }
  lines.push('');
  lines.push(',,,,,');
  lines.push('--- ブランド別 ---');
  lines.push('brand,revenue,sales_count');
  for (const r of data.byBrand) lines.push(`${r.brand},${r.revenue},${r.salesCount}`);
  lines.push('');
  lines.push('--- プラットフォーム別 ---');
  lines.push('platform,revenue,sales_count');
  for (const r of data.byPlatform) lines.push(`${r.platform},${r.revenue},${r.salesCount}`);
  lines.push('');
  lines.push('--- 言語別 ---');
  lines.push('language,revenue,sales_count');
  for (const r of data.byLanguage) lines.push(`${r.language},${r.revenue},${r.salesCount}`);
  lines.push('');
  lines.push('--- トップ10作品 ---');
  lines.push('rank,work_id,title,brand,revenue,sales_count');
  data.topWorks.forEach((w, i) => {
    lines.push(`${i + 1},${w.work_id},"${w.title.replace(/"/g, '""')}",${w.brand},${w.revenue},${w.salesCount}`);
  });

  return lines.join('\n');
}
