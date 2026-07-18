# SPEC: cron APIの二経路認証（認証no-opの修正）

## 目的
`/api/cron/notion` と `/api/cron/snapshot` の認証が実質no-op（照合ifの中身が空・401分岐なし）で、
無認証でNotion同期・スナップショット生成を実行できる穴を塞ぐ。画面からの手動同期は壊さない。
背景は `deep-think_サービス改善ロードマップ_2026-07-18.md` P0-2（合格済み）。

## 変更対象
- 新規：`src/lib/auth/cron.ts`（認証判定の共通helper）
- 新規：`scripts/cron-auth-test.ts`（helperの単体テスト、node:assert、DB不要）
- 変更：`src/app/api/cron/notion/route.ts`、`src/app/api/cron/snapshot/route.ts`
- 参照のみ（変更禁止）：`src/app/api/cron/revalidate/route.ts`（正しい実装例だが今回は触らない）、`src/proxy.ts`

## 要求仕様
1. 共通helper `src/lib/auth/cron.ts`：
   - `hasValidCronBearer(request)`: CRON_SECRET が設定済みかつ `Authorization: Bearer <CRON_SECRET>` 完全一致で true。SECRETが未設定なら常に false（フェイルクローズ）
   - `hasValidSession(request)`: 既存 `verifySessionToken`（src/lib/auth/session.ts）でCookieを検証し、非GETの場合は revalidate/route.ts と同等の Origin 検証も行う
   - 判定ロジックは純粋関数に分離し、単体テスト可能にする（Requestオブジェクトを組み立てて検証）
2. `/api/cron/notion`（POST/GET両方）：`hasValidCronBearer || hasValidSession` を満たさなければ 401 を返す。
   これにより (a) Vercel Cron / GitHub Actions の Bearer 呼び出し、(b) ログイン済み画面（ReportActions.tsx、
   Bearerなし・Cookie付きPOST）の両方が引き続き動く
3. `/api/cron/snapshot`（POST/GET両方）：`hasValidCronBearer` のみ許可（画面からの導線は
   /ingestion/trigger 経由の別APIか確認し、直接このrouteを叩く画面コードがあれば notion と同じ
   二経路にする。なければBearer専用）。※調査時の把握では snapshot への画面直叩きは未確認。
   実装前に `grep -rn "cron/snapshot" src/` で確認し、結果を報告に含めること
4. `src/proxy.ts` の `/api/cron/` 除外は**変更しない**（除外を外すとVercel Cron/GitHub Actionsの
   Bearer呼び出しがproxyの手前で401になるため）。認証はroute内で完結させる
5. `scripts/cron-auth-test.ts`：最低限のケース
   - Bearer一致→許可／不一致→拒否／SECRET未設定→拒否
   - 有効セッションCookie＋同一Origin POST→許可／無効Cookie→拒否／有効Cookieでも異Origin POST→拒否
   - どちらも無し→拒否
6. 401レスポンスは `{ error: 'unauthorized' }` 形式（revalidateと同じ）

## スコープ外
- revalidate/route.ts の変更（既に正しい）
- CRON_SECRET のローテーション（不要と判断済み）
- Snapshot/Notion の部分失敗ハンドリング（P1-8で実施）

## 受け入れ基準
- [ ] `npx tsx scripts/cron-auth-test.ts` 全assert成功
- [ ] `npx tsc --noEmit` 成功
- [ ] `npm run build` 成功（Claude側）
- [ ] 本番で無認証 `POST /api/cron/notion` が401（Claude側で確認）
- [ ] 本番でBearer付き呼び出しが従来どおり成功（Claude側、翌朝のVercel Cron成功でも確認）
- [ ] git diff が変更対象のみ

## 動作確認方法
- Codex側：cron-auth-test.ts／tsc／grep結果の報告
- Claude側：build→デプロイ→curlで無認証401確認→ログイン画面からの手動同期の動作確認（可能なら）

## 制約・注意
- verifySessionToken は async（Web Crypto）。helperも async でよい
- Edge/Node ランタイムの差異に注意（既存routeのランタイム指定を変えない）
