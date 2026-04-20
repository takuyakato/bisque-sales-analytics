#!/usr/bin/env node
/**
 * Supabase Storage の bisque-snapshots/ バケットをローカル data/snapshots/ にミラー
 * 使い方: node scripts/download-snapshots.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'bisque-snapshots';
const OUT_ROOT = path.resolve('data/snapshots');

async function downloadPath(subdir) {
  const { data: files, error } = await supabase.storage.from(BUCKET).list(subdir, { limit: 1000 });
  if (error) {
    console.error(`list ${subdir} failed: ${error.message}`);
    return 0;
  }
  if (!files) return 0;
  mkdirSync(path.join(OUT_ROOT, subdir), { recursive: true });
  let count = 0;
  for (const f of files) {
    if (!f.name.endsWith('.csv')) continue;
    const remote = `${subdir}/${f.name}`;
    const { data: body, error: dlErr } = await supabase.storage.from(BUCKET).download(remote);
    if (dlErr || !body) {
      console.error(`download ${remote} failed: ${dlErr?.message}`);
      continue;
    }
    const buf = Buffer.from(await body.arrayBuffer());
    writeFileSync(path.join(OUT_ROOT, subdir, f.name), buf);
    count += 1;
  }
  return count;
}

const latest = await downloadPath('latest');
const daily = await downloadPath('daily');
console.log(`mirrored ${latest} latest + ${daily} daily files → ${OUT_ROOT}`);
