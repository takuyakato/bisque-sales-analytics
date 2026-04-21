#!/usr/bin/env tsx
/**
 * Fanzaの最古取得可能月を特定するプローブ
 * 各月ヘッダーを取得して "該当作品：0" か行ありかを確認
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { FanzaScraper } from '../src/lib/scrapers/fanza';
import { parseCsv } from '../src/lib/csv-parser/index';

const probes = [
  { from: '2023-06-01', to: '2023-06-30', label: '2023-06' },
  { from: '2024-06-01', to: '2024-06-30', label: '2024-06' },
  { from: '2025-06-01', to: '2025-06-30', label: '2025-06' },
  { from: '2025-10-01', to: '2025-10-31', label: '2025-10' },
];

(async () => {
  const scraper = new FanzaScraper();
  try {
    await scraper.launch();
    await scraper.ensureLoggedIn();
    console.log('✅ Fanza login OK\n');

    for (const p of probes) {
      try {
        const buf = await scraper.fetchSalesCsv(p.from, p.to);
        const parsed = parseCsv({
          buffer: buf,
          filename: `fanza_${p.from}_${p.to}.csv`,
          platform: 'fanza',
          periodOverride: { from: p.from, to: p.to },
        });
        console.log(`${p.label}: bytes=${buf.byteLength}  rows=${parsed.rows.length}  skipped=${parsed.skipped}`);
      } catch (e) {
        console.log(`${p.label}: ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await scraper.close();
  }
})();
