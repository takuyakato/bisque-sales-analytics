#!/usr/bin/env node
/**
 * Phase 0: 言語自動判定の精度測定
 *
 * 実CSV 2本 (sales (2).csv, sales_all_0_20260401_20260419.csv) を対象に、
 * (a) 単純な正規表現ベースの判定
 * (b) franc ライブラリ（インストール済みの場合のみ）
 * の精度を比較する。
 *
 * 実行: node scripts/phase0/test-language-detection.mjs
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const DLSITE_CSV = path.join(DATA_DIR, 'sales (2).csv');
const FANZA_CSV = path.join(DATA_DIR, 'sales_all_0_20260401_20260419.csv');

// ---------- ユーティリティ: CP932 → UTF-8 ----------
function readCP932(filepath) {
  const utf8 = execSync(`iconv -f CP932 -t UTF-8 "${filepath}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return utf8;
}

// ---------- 正規表現ベースの言語判定 ----------
function detectByRegex(title) {
  // 文字化け率
  const qRatio = (title.match(/\?/g)?.length ?? 0) / title.length;
  if (qRatio > 0.2) return 'unknown';

  if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(title)) return 'ko';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(title)) return 'ja';

  if (/[\u4E00-\u9FFF]/.test(title)) {
    const hasTrad = /[繁體臺灣為會並傳專學習國當說時來這個這些點頭]/.test(title);
    const hasSimp = /[简体台湾为会并传专学习国当说时来这个这些点头]/.test(title);
    if (hasSimp && !hasTrad) return 'zh-Hans';
    if (hasTrad) return 'zh-Hant';
    return 'zh-Hant'; // デフォルト
  }

  if (/^[\x00-\x7F]+$/.test(title)) return 'en';
  return 'unknown';
}

// ---------- CSVパース（雑版）----------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0];
  const rows = lines.slice(1).map((line) => {
    // シンプルなCSVパース（引用符対応）
    const fields = [];
    let cur = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) {
        fields.push(cur);
        cur = '';
      } else cur += ch;
    }
    fields.push(cur);
    return fields;
  });
  return { header, rows };
}

// ---------- メイン ----------
console.log('='.repeat(72));
console.log('Phase 0: 言語自動判定の精度測定');
console.log('='.repeat(72));

// ========== DLsite CSV ==========
console.log('\n--- DLsite CSV: sales (2).csv ---\n');
const dlsiteText = readCP932(DLSITE_CSV);
const { header: dlHeader, rows: dlRows } = parseCsv(dlsiteText);
console.log('Header:', dlHeader);

// 作品ID=TOTAL を除外、作品名(5番目の列)を抽出
const dlTitles = dlRows
  .filter((r) => r[3] !== 'TOTAL' && r[4])
  .map((r) => ({ id: r[3], title: r[4] }));

// 作品IDごとにユニーク化（同一IDで複数価格帯レコードあり）
const dlUnique = new Map();
for (const { id, title } of dlTitles) {
  if (!dlUnique.has(id)) dlUnique.set(id, title);
}

console.log(`ユニーク作品数: ${dlUnique.size}`);

// 言語判定結果
const dlResults = {};
const dlSamples = [];
for (const [id, title] of dlUnique) {
  const lang = detectByRegex(title);
  dlResults[lang] = (dlResults[lang] ?? 0) + 1;
  dlSamples.push({ id, title: title.slice(0, 40), lang });
}

console.log('\n判定結果サマリ:');
for (const [lang, count] of Object.entries(dlResults).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${lang.padEnd(10)}: ${count}作品`);
}

console.log('\n各言語から3件ずつサンプル:');
const byLang = {};
for (const s of dlSamples) {
  (byLang[s.lang] ??= []).push(s);
}
for (const [lang, items] of Object.entries(byLang)) {
  console.log(`\n  [${lang}] (${items.length}件)`);
  for (const it of items.slice(0, 3)) {
    console.log(`    ${it.id}: ${it.title}...`);
  }
}

// ========== Fanza CSV ==========
console.log('\n\n--- Fanza CSV: sales_all_0_20260401_20260419.csv ---\n');
const fanzaText = readCP932(FANZA_CSV);
const { header: fzHeader, rows: fzRows } = parseCsv(fanzaText);
console.log('Header:', fzHeader);

const fzTitles = fzRows
  .filter((r) => r[1] && r[2])
  .map((r) => ({ id: r[1], title: r[2] }));

const fzUnique = new Map();
for (const { id, title } of fzTitles) {
  if (!fzUnique.has(id)) fzUnique.set(id, title);
}

console.log(`ユニーク作品数: ${fzUnique.size}`);

const fzResults = {};
const fzSamples = [];
for (const [id, title] of fzUnique) {
  const lang = detectByRegex(title);
  fzResults[lang] = (fzResults[lang] ?? 0) + 1;
  fzSamples.push({ id, title: title.slice(0, 40), lang });
}

console.log('\n判定結果サマリ:');
for (const [lang, count] of Object.entries(fzResults).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${lang.padEnd(10)}: ${count}作品`);
}

console.log('\n各言語から3件ずつサンプル:');
const byLangFz = {};
for (const s of fzSamples) {
  (byLangFz[s.lang] ??= []).push(s);
}
for (const [lang, items] of Object.entries(byLangFz)) {
  console.log(`\n  [${lang}] (${items.length}件)`);
  for (const it of items.slice(0, 3)) {
    console.log(`    ${it.id}: ${it.title}...`);
  }
}

console.log('\n' + '='.repeat(72));
console.log('完了。判定結果を目視で確認し、誤判定率を計測してください。');
console.log('='.repeat(72));
