# revalidate 504修正とMVリフレッシュ設計の見直し（deep-think 最終レポート）

日付: 2026-07-21
参加: Claude（提案）／Codex gpt-5.6-sol・推論high（反論）／auditor別セッション（判定）

## 問い・制約・判断基準

**問い**
1. 応急修正（/api/cron/revalidate の maxDuration 60→300秒）は妥当か
2. 「HTTPリクエスト内で7本のMVを順次REFRESH」する現行設計を続けてよいか

**制約**: 非エンジニア運用者1名／Vercel Hobby（Pro移行は支払い設定待ち）／新インフラ追加は原則避ける／定額運用

**判断基準**: ①毎朝のcron 3本が安定成功 ②取込後にダッシュボードが速やかに最新化 ③データ成長に2〜3年耐える ④小規模チームに見合うコスト

## 結論

- **応急修正（maxDuration=300）は妥当**。ただし恒久策ではなく、下記P2完了後に60秒へ戻す
- **恒久策は3段階の「案B′」を採用**：

### P1: セキュリティ修正（最優先・設計論争と独立）
議論の過程で**本物の脆弱性を発見・実証**した。公開されているanonキーで重いMVリフレッシュRPCが誰でも実行できる（HTTP 204を実測）。PostgreSQLの関数はデフォルトでPUBLICに実行権が付き、migration 017はanon/authenticated個別REVOKEのみでPUBLIC付与を消していなかった。
→ migration 022: 全public関数に `REVOKE EXECUTE ... FROM PUBLIC` ＋ DEFAULT PRIVILEGES同様＋SECURITY DEFINER関数に `SET search_path`。受け入れ基準は「anonで拒否」と「service_role経由の既存9 RPCが引き続き成功」の両方。

### P2: MVリフレッシュを GitHub Actions 側へ移す（強化版）
- 専用スクリプトを新規作成（既存 scripts/refresh-mvs-individual.ts は .env.local無条件読込・失敗でも終了コード0のため流用不可）。要件: env検証／1本でも失敗なら exit 1／指数バックオフ再試行／MV別所要msの1行JSON出力
- 各ワークフロー末尾: スクリプト実行 → 成功時のみ `POST /api/cron/revalidate`（curl --retry 3 --max-time 30）。DLsite/Fanzaの timeout-minutes 15→30
- revalidate route はキャッシュタグ破棄専用に簡素化し、`revalidateTag('sales-data', { expire: 0 })` に変更（現行の 'max' はstale-while-revalidateのため取込後の初回アクセスに旧データが出る。外部トリガー時の expire:0 はNext.js公式推奨パターン）。maxDuration 60 に戻す
- 受け入れ基準: ①正常系3本緑＋最新化 ②故意失敗で赤 ③2本同時実行で両方緑 ④revalidate応答2秒未満

### P3: 観測と見直しトリガー
- MV別所要時間ログを常設し、**単一MVが60秒を超えたらMV統合（7本→2本程度）に着手**と明文化
- SPEC.md §6 と CLAUDE.md の Cron 記述を実態に更新（/api/cron/daily は存在せず、実際は notion + snapshot）

## 根拠と却下した代替案

**実測データ（2026-07-21）**
- MVリフレッシュ7本合計 約76秒（最大は monthly_platform_summary 17.2秒）
- sales_daily 27,069行／youtube_metrics_daily 1,101,722行（重さの主因はYouTube）。線形成長でも3年で単一MV約40〜50秒 ＜ 120秒(statement_timeout)壁
- 競合最悪ケース（3ワークフロー完全同時）でもロック待ち込み51秒/statement ＜ 120秒で安全圏
- sales_daily の aggregation_unit='monthly' 行は全期間0件（混在バグの現害なし）

**却下した代替案**
- MV 7→2統合の即時実施: DB負荷は計約4分/日で無害。稼働中ダッシュボードの全クエリ書換リスクの方が大きい。P3トリガー到達時に着手する条件付き延期
- Supabase内リース/実行履歴テーブル: 呼び出し元が既知の3本のみの規模には過剰。競合悪化時はGH Actionsのconcurrency group（1行）で対処
- 全MVの完全原子化: ロック長期化で読み手をブロック。全成功時のみキャッシュ破棄＋翌run自己修復で実用十分
- 通知基盤追加・網羅テスト: GitHub失敗メールが現に機能。受け入れ基準4項目で規模相応

## 議論の経緯

**Round 1（Codex反論）**: 重大12件を含む23指摘。主要なもの：
1. 案Bでも120秒/本の制約は残る → 一部受入（初案も明記済み。timeout拡大を明記）
2. 既存スクリプトは失敗検知が壊れている → **事実確認し受入**（書き直し要件化）
3. revalidateTag('max')はstale配信で「即時最新化」を満たさない → **公式ドキュメントで確認し受入**（expire:0へ）
4. RPCのPUBLIC EXECUTE残存＝匿名DoS → **anonキーHTTP 204で実証し受入**（P1として最優先化）
5. MV冗長・粒度混在・成長未立証 → 実測データで反証（monthly行0件、成長余裕2倍以上）
6. Vercel Cron記述の誤り（/api/cron/daily不存在） → 受入（転記ミス。SPEC/CLAUDE.md更新へ）

**Round 2（Claude修正→auditor判定）**: 案B′に改訂。auditorがリポジトリ実査で反証根拠を裏取りし**合格**判定。Codexの過剰要求7件（統合即時実施・リーステーブル・完全原子化・通知基盤等）は棄却が妥当と認定。

## 未解決論点（要・加藤さん判断）

**なし**（設計上の未解決はゼロ）。ただし実装時の非ブロッキング注意4点をauditorが指摘済み：
1. P1受け入れ基準に service_role 経由RPCの回帰確認を含める（計画に反映済み）
2. 競合の理論上の隙間（単一MV40秒×3並走）はトリガー60秒との間に余白が薄い→再試行と自己修復で許容
3. CLAUDE.mdのCron記述もSPEC.mdと同時更新
4. daily_breakdown_summary に将来 `WHERE aggregation_unit='daily'` を入れる安価な恒久策を次回MV変更時に

## 判定結果

auditor判定: **合格**（重大指摘ゼロ）。1往復＋修正で終了（上限3往復のうち）。
実装は codex-implement へ発注可能な状態。優先順: P1（脆弱性・即時）→ P2 → P3。
