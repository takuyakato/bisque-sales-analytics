# bisque-sales-analytics サービス改善ロードマップ（deep-think 最終レポート）

日付: 2026-07-18／参加: Claude（提案）× Codex（反論）× auditor（判定・合格）
前提調査: サブエージェント2体（プロダクト側・データ運用側）＋主要主張は実コードで裏取り済み

## 問い・制約・判断基準
- **問い**：着地見込み対応の次に、何をどの順で改善すべきか（やらないことの明確化を含む）
- **制約**：Claude（計画・検収）+Codex（実装）体制／既存構成（Next.js+Supabase+GitHub Actions+Vercel）内／新規従量課金なし／小規模チーム相応の保守コスト
- **判断基準**：①経営判断に使う数字の正確性 ②「静かに壊れる」構造の解消 ③実穴のセキュリティ ④新機能はYAGNI

## 結論：3段階ロードマップ

### P0（今週）
1. **DB公開権限の遮断**【セキュリティ・最優先】
   売上集計MV・RPC・全テーブルが Supabase の anon キー（公開前提のキー）で直接読める状態
   （migrations 007/008/010/011/012 の GRANT TO anon、001/002 の USING(true) ポリシー）。
   ログイン画面を迂回して売上データを取得できる情報漏洩経路。
   REVOKE migration＋RLS整理で遮断。アプリは全26箇所が service client 使用のため影響なし
   （検証済み）。未使用の supabase/client.ts と server.ts は削除、NEXT_PUBLIC_SUPABASE_ANON_KEY 退役。
   検収＝anonキー直叩きで全拒否＋全画面表示確認。ロールバック用の復元migrationを用意。
2. **cron二経路認証**【セキュリティ】
   /api/cron/notion・snapshot の認証が実質no-op（照合ifの中身が空・401分岐なし。snapshotは
   条件が逆向きの空ブロックという二重の壊れ方）。無認証でNotion書き換え・スナップショット乱発・
   DB負荷（100万行走査）を誘発できる。
   修正：notion=「有効セッション＋Origin」or「Bearer CRON_SECRET」、snapshot/revalidate=Bearer必須。
   共通helper化＋単体テスト。**proxy.ts の /api/cron/* 除外は維持し、検証はroute内で行う**
   （除外を外すとVercel Cron/GitHub ActionsのBearer呼び出しが死ぬ）。SECRETローテーションは不要
   （漏洩根拠なし。無認証期間に可能だったのは実行のみでsecret値は読めない）。
3. **取込結果契約の統一（静かな失敗の根絶・取込側）**
   現状：スクレイパー失敗がGitHub Actionsでは緑表示（Fanza日次はbackfill経路で終了コード
   未設定）、開始時に status='success' を先に記録（強制終了で偽success残留）、1実行で
   ingestion_log 二重作成、logger更新失敗の握り潰し、空CSVがsuccess、revalidateはMV失敗でも
   200/ok:true、workflowは `|| true` で全部成功扱い。
   修正：running状態の追加（CHECK制約migration）／1実行1ログ／partial・failedとも非0終了／
   logger失敗もプロセス失敗／空CSV・必須列検証／revalidateはMV失敗で非2xx＋maxDuration明示／
   `curl --fail-with-body` 化・`|| true` 全廃。
4. **為替の方式決定スパイク＋過去補正**【数字の正確性】
   現状：daily_ratesが2026-04-20で停止し、以降のYouTube売上（構成比約14%）は150円/USD固定換算。
   自動更新の仕組み自体がない。
   修正：まずYouTube Analytics API `currency=JPY` での直取得可否（過去分の再取得含む）を半日で
   検証。可ならJPY直取得へ切替（Google換算＝支払い実態に最も近く、外部レート依存を排除）。
   不可ならFrankfurter強化版（増分取得・レート範囲/前日比検証・非0終了・run ID記録・専用workflow）。
   **過去分の補正は dry-run で月次差分レポート→ユーザー承認後に適用**（表示数値が変わるため）。

### P1（今月）
5. **Slackデイリーダイジェスト**：毎朝1通（各ソースの最終成功・complete_through・MV反映状態・
   失敗一覧・本番ヘルスチェック）＋failure時の即時通知。「毎日届く」ことが正常信号で、
   未着＝ジョブ未起動の検知を兼ねる（デッドマン監視の1人運用向け代替）。
6. **二層ウォーターマーク**：source_watermarks（dlsite/fanza/youtube:jp/youtube:en 別
   complete_through・成功run ID）＋projection_refresh_runs（MV別status・反映run ID）。
   ダッシュボード鮮度表示のソースをここへ切替。MV REFRESHはadvisory lockで直列化
   （NOWAIT/短timeout＋リトライ。無限待ち禁止）。
7. **リスク基準CI**（push時1本・5分以内）：app/scripts両方の型検査（scripts用tsconfig追加）・
   ESLint --max-warnings=0（現12件は先に修正）・forecast-test・認証helperテスト・CSV契約テスト・
   next build。
8. **Snapshot/Notionの部分失敗の失敗化**：ページングbreakによるデータ切り詰め・upload失敗warn・
   Notion block更新失敗の握り潰しを廃止し、非2xx＋ダイジェスト表示に。

### P2（来月以降）
9. ドキュメント整合：プロジェクトCLAUDE.md（「Phase 1a←現在」のまま）・README（ボイラープレート
   のまま）・SPECへ/overseas追記・docs/setup-vps-runner.md の処理
10. VPS実態確認（要ユーザー回答）→未使用なら runner登録解除・トークン/SSH鍵失効・破棄・解約
    （NOPASSWD sudo付きrunnerのため、コストだけでなくセキュリティ後始末が必要）
11. /platforms画面は「既存ダッシュボードとの重複精査の上で保留」、/variantsのナビ昇格は利用頻度次第

### やらないこと（明示）
- Vitest 80%カバレッジ／ローカルE2E基盤（next build＋本番ヘルスチェック＋毎日の実利用で代替）
- 有料監視SaaS／別スケジューラのデッドマン監視（ダイジェスト方式で代替）
- MVリフレッシュの1日1回集約（即時性優先。lock直列化で競合解消）
- 多ユーザーAuth・新プラットフォーム対応（事業判断待ち）

## 健全と確認できたもの（対応不要）
孤立works 0件／brand・language unknown 0件／monthly・daily混在なし／denormalization排除は
migration 009で完了済み／Notion同期は稼働中（7/17同期確認）／認証のコア実装（HMACセッション・
bcrypt・レート制限・requireAuth）は堅実。
※メモリの「YouTubeバックフィル後の宿題（denormalization排除・孤立works掃除）」は解消済み。

## 議論の経緯
- **ラウンド1（Claude初案）**：cron認証穴・為替停止・失敗可視化をP0とする3段階ロードマップ。
- **Codex反論（重大22件・中9件）**：①最大の穴はcronではなくanon向けDB公開（見落とし）
  ②cron修正案は画面の手動同期を壊す ③為替スクリプトはそのままでは動かない・そもそもECBレートが
  「正しい」根拠がない（YouTube APIのJPY直取得が優る） ④失敗伝播の穴は想定より深い（開始時
  success記録・二重ログ・空CSV・部分成功の握り潰し） ⑤freshness一表設計は不成立 など。
- **ラウンド2（Claude修正）**：上記をほぼ全面受入して再構成。デッドマン監視・MV1日1回集約・
  ローカルE2Eの3件は規模に照らして部分反証（ダイジェスト／lock直列化／build+ヘルスチェックで代替）。
- **auditor判定**：**合格**。全主要指摘を実コードで裏取りし、v2の前提（anon遮断の影響範囲が
  限定的）も独立検証で確認。部分反証3件も妥当と判定。実装時の注意4点（lockとVercelタイムアウト・
  二経路認証の実装位置・server.tsの同時削除・running追加のCHECK制約migration）は本レポートに反映済み。

## 未解決論点（要・加藤さん判断）
1. **為替の「正しさ」の定義と過去補正の承認**：推奨はYouTube APIのJPY直取得への切替。
   いずれの方式でも過去のYouTube売上表示が数%変わるため、適用前に差分レポートを提示して承認を得る。
2. **VPS契約の実態**：docs/setup-vps-runner.md の日本VPS（self-hosted runner）が契約中か。
   現行ワークフローは全てGitHub hostedで未使用の可能性が高い。契約中なら解約＋セキュリティ後始末を実施。
3. **P0の実装着手の承認**（承認あれば codex-implement で順次発注：P0-1→P0-2→P0-3→P0-4）

## 判定結果
auditor（fable・議論不参加）判定：**合格**。Codex反論1回→修正1回の計1往復で決着（上限3往復以内）。
中間ファイル：セッションscratchpad/deep-think2/（round1_proposal.md, round1_codex.md, round2_proposal.md）
