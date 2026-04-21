import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { getMonthlyReport, getAvailableMonths } from '../src/lib/queries/monthly-report';

(async () => {
  try {
    console.log('getAvailableMonths実行...');
    const months = await getAvailableMonths();
    console.log(`  取得: ${months.length}件, 先頭: ${months.slice(0, 5).join(', ')}`);

    const target = process.argv[2] ?? '2026-04';
    console.log(`\ngetMonthlyReport(${target}) 実行...`);
    const data = await getMonthlyReport(target);
    console.log(`  summary: ¥${data.summary.totalJpy.toLocaleString()}`);
    console.log(`  byPlatform: ${data.byPlatform.length}件`);
    console.log(`  byLanguage: ${data.byLanguage.length}件`);
    console.log(`  dailyTable: ${data.dailyTable.length}行`);
    console.log(`  dailyBrand: ${data.dailyBrand.length}行`);
    console.log(`  dailyLanguage: ${data.dailyLanguage.length}行`);
    console.log(`  topWorks: ${data.topWorks.length}件`);
  } catch (e) {
    console.error('ERROR:', e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) console.error(e.stack);
  }
})();
