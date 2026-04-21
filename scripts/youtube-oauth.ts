#!/usr/bin/env tsx
/**
 * YouTube OAuth 認可ヘルパー
 * 1チャンネル分のリフレッシュトークンを対話的に取得する
 *
 * 使い方:
 *   npx tsx scripts/youtube-oauth.ts jp   # BLsand日本
 *   npx tsx scripts/youtube-oauth.ts en   # BLsand英語
 *
 * 流れ:
 *   1. 認可URLをコンソールに表示
 *   2. ブラウザでURLを開き、対象チャンネルのGoogleアカウントで承認
 *   3. 承認後に http://localhost:XXXX/?code=... にリダイレクトされる
 *   4. スクリプトが自動でコードを受け取り、リフレッシュトークン取得
 *   5. トークン + channel_id をコンソール出力
 *   6. 加藤さんが .env.local に貼る
 */
import { readFileSync } from 'fs';
import http from 'http';
import { google } from 'googleapis';
import { URL } from 'url';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
];

const label = process.argv[2] ?? 'unlabeled';
if (!['jp', 'en', 'ko', 'test'].includes(label)) {
  console.error(`ラベル不正: "${label}"。jp / en / ko / test のいずれかを指定してください`);
  process.exit(1);
}

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET が .env.local にありません');
  process.exit(1);
}

const port = 53423;
const redirectUri = `http://localhost:${port}`;

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',     // リフレッシュトークン発行
  prompt: 'consent',          // 既に同意していても毎回確認（リフレッシュトークン再発行）
  scope: SCOPES,
});

console.log(`\n=== YouTube OAuth 認可 (ラベル: ${label}) ===\n`);
console.log('以下のURLをブラウザで開いて、対象チャンネルのGoogleアカウントで承認してください：\n');
console.log(authUrl);
console.log('\n（開くと警告が出ます → 「詳細」→ 「...に移動」で進んでください。テストアプリのため正常）\n');
console.log(`ローカルサーバー起動中... (port ${port})\n`);

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url ?? '/', redirectUri);
    const code = u.searchParams.get('code');
    const errParam = u.searchParams.get('error');
    if (errParam) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>認可失敗</h1><p>${errParam}</p>`);
      console.error('\n認可失敗:', errParam);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(404);
      res.end('code なし');
      return;
    }

    // コード → トークン交換
    const { tokens } = await oauth2.getToken(code);

    // YouTube APIで自分のチャンネル情報を取得
    oauth2.setCredentials(tokens);
    const yt = google.youtube({ version: 'v3', auth: oauth2 });
    const ch = await yt.channels.list({ part: ['id', 'snippet'], mine: true });
    const me = ch.data.items?.[0];

    const labelUpper = label.toUpperCase();
    const envLines = [
      `# YouTube ${label} channel`,
      `YOUTUBE_REFRESH_TOKEN_${labelUpper}=${tokens.refresh_token ?? ''}`,
      `YOUTUBE_CHANNEL_ID_${labelUpper}=${me?.id ?? ''}`,
      `# channel_name: ${me?.snippet?.title ?? '(unknown)'}`,
    ];

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;">
        <h1>✅ 認可成功</h1>
        <p>チャンネル: <strong>${me?.snippet?.title ?? '(unknown)'}</strong></p>
        <p>ID: <code>${me?.id ?? ''}</code></p>
        <p>スクリプト側（ターミナル）に出力した値を <code>.env.local</code> に貼ってください。</p>
        <p>このタブは閉じて大丈夫です。</p>
      </body></html>
    `);

    console.log('\n✅ 認可成功\n');
    console.log(`チャンネル: ${me?.snippet?.title ?? '(unknown)'}`);
    console.log(`ID: ${me?.id}\n`);
    console.log('--- .env.local に追記してください ---\n');
    console.log(envLines.join('\n'));
    console.log('\n-------------------------------\n');

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } catch (e) {
    console.error('\nエラー:', e instanceof Error ? e.message : e);
    res.writeHead(500);
    res.end('server error');
    server.close();
    process.exit(1);
  }
});

server.listen(port, () => {
  console.log(`承認後、http://localhost:${port} でコードを受け取ります。ブラウザで URL を開いてください。`);
});
