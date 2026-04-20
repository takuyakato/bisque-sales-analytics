#!/usr/bin/env tsx
import { readFileSync } from 'fs';
import { generateSnapshots } from '../src/lib/snapshot/generate';

try {
  const envText = readFileSync('.env.local', 'utf8');
  envText.split('\n').forEach((l) => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch {}

async function main() {
  const r = await generateSnapshots();
  console.log('✅ snapshots generated:');
  r.files.forEach((f) => console.log('  -', f));
  console.log(`totalRevenueJpy = ${r.totalRevenueJpy.toLocaleString()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
