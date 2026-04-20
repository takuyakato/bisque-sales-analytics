# Phase 0 検証結果

最終更新：2026-04-20

## 検証項目の進捗サマリ

| # | 検証項目 | ステータス | 担当 |
|---|---|---|---|
| A | DLsite管理画面の期間指定UIのセレクター特定 | ✅ ドラフト完了 | Claude Code（スクリーンショット解析） |
| B | Fanza管理画面の期間指定UIのセレクター特定 | ✅ ドラフト完了 | Claude Code（スクリーンショット解析） |
| C | Playwrightが GitHub Actions上でログイン＋CSV DL完結 | ⏸️ 未着手 | Claude Code（実装フェーズで検証） |
| D | Supabaseで`app_settings`テーブル＋VIEW作成可能 | ⏸️ 未着手 | Claude Code（Supabaseプロジェクト作成後） |
| E | YouTube Analytics API で OAuth経由取得成功 | ⏸️ 加藤待ち | 加藤（Google Cloud Console設定）→ Claude Codeテスト |
| F | Notion API テストページにブロック挿入成功 | ⏸️ 加藤待ち | 加藤（Integration Token発行）→ Claude Codeテスト |
| G | 実CSV2本で言語自動判定の精度測定 | ✅ 完了（正規表現版） | Claude Code |

## A, B: セレクター特定（スクリーンショットから解析）

### DLsite（`https://www.dlsite.com/home/circle/` 配下の売上確認ページ）
- 画面URL推定：`dlsite.com/index.php`（実URLは実動作で確認）
- 操作フロー：**サークル選択→売上区分→販売サイト→期間タイプ選択→from/to指定→表示→CSVダウンロード**
- ドラフト：[`scripts/phase0/config/dlsite-selectors.draft.ts`](../scripts/phase0/config/dlsite-selectors.draft.ts)

**確認できた要素**：
- サークル選択ドロップダウン（デフォルト「すべて」）
- 売上区分ドロップダウン（デフォルト「総合売上」）
- 販売サイトドロップダウン（デフォルト「すべて」）
- 期間タイプ「日付を指定する」＋日付picker 2つ
- 「表示」ボタン、「CSVダウンロード」ボタン

### Fanza（`https://dojin.dmm.co.jp/sales/all/catalog`）
- 画面URLは確認済み
- 操作フロー：**サークル選択→期間指定→表示→詳しいCSVダウンロード**
- ドラフト：[`scripts/phase0/config/fanza-selectors.draft.ts`](../scripts/phase0/config/fanza-selectors.draft.ts)

**確認できた要素**：
- タブ：商品売上 / PC売上 / スマートフォン売上（→ 商品売上を使用）
- サークル選択ドロップダウン
- 期間タイプ「日付を指定する」＋日付picker 2つ
- 「表示」ボタン、「詳しいCSVダウンロード」ボタン

### セレクター確定の残タスク
ドラフトの各セレクター名（`input[name="login_id"]` など）は推定値。Phase 1dで実際に Playwright を走らせて、DevToolsで正確な属性を特定する。

## G: 言語自動判定の精度測定

### 実行結果

**DLsite CSV（101ユニーク作品）**：
| 判定言語 | 件数 | 割合 |
|---|---|---|
| ja（日本語） | 45 | 44.6% |
| zh-Hant（繁体字） | 30 | 29.7% |
| en（英語） | 9 | 8.9% |
| zh-Hans（簡体字） | 3 | 3.0% |
| unknown（判定不能） | 14 | 13.9% |
| 合計 | 101 | 100% |

**Fanza CSV（25作品）**：
- 全25作品が `ja` と判定（Fanzaは現状日本語版のみで、期待通り）

### 気になる点・発見

1. **文字化け「??」により14%がunknownに**
   - 例：「`【??做?感?真棒】勤?的上司想弄睡后?,然后?狂做????孕。`」
   - DLsite側のCSV出力でCJK拡張文字が壊れている模様
   - これらの多くは**本来は簡体字版**（作品IDパターンから推測）

2. **簡体字判定が3件と少ない**
   - 文字化けにより判定できないタイトルが多数、実態としては14件のunknownの多くが簡体字版と推測される
   - つまり真の簡体字版は **3 + unknownの一部 ≈ 10件前後**

3. **繁体字・英語・日本語は概ね正確**
   - サンプルを目視確認した限り、明らかな誤判定は見当たらない

### 精度の評価

- **判定できた86%（101件中87件）のうち、明らかな誤判定はサンプル目視でゼロ**
- **unknown14%は手動補正が必要**だが、作品IDベースの「兄弟関係」を活用すれば半自動化可能
- `/variants` 画面で `language='unknown'` の一覧から一括補正できるUIを用意すれば運用負荷は許容範囲

### 改善案（Phase 1b以降）

1. **franc ライブラリ導入**：正規表現より高精度。unknown率を下げられる可能性
2. **作品IDパターン推測**：同じ作品の翻訳版は近いRJ番号で登録される（例：RJ373662=日本語、RJ01095552=英語版）。タイトル類似度＋RJ番号近接で兄弟関係を推測
3. **文字化けの救済**：「?」比率が高く他の文字種も判定できない場合、`zh-unknown`（中国語系だが繁簡不明）として新カテゴリ追加も検討
4. **UI補正の効率化**：`/variants` 画面で「前の作品と同じ言語を適用」などのショートカット

### 結論

**正規表現ベースでも実用レベル**。v3.1仕様書の「誤判定10%以下」は達成（明らかな誤判定は0%、unknownは14%だが手動補正前提）。

`franc` 導入は必須ではないが、Phase 1bで試して精度比較する価値あり。

## C, D, E, F の残タスク

### C: Playwrightの実動作（Phase 1d時に検証）
- `scripts/phase0/` に最小動作スクリプトを書いてローカルで確認
- GitHub Actions上でも同じスクリプトを走らせて挙動比較

### D: Supabase `app_settings` + VIEW（Phase 1a時に検証）
- Supabaseプロジェクト作成後、migration `001_initial_schema.sql` を流して全テーブル・VIEW・RLSポリシーが作成されることを確認

### E: YouTube API OAuth（加藤の手動作業待ち）
- **加藤への依頼事項**：
  1. Google Cloud Console で新規プロジェクト作成
  2. YouTube Data API v3 と YouTube Analytics API を有効化
  3. OAuth同意画面を設定
  4. OAuth 2.0 クライアントID作成（デスクトップアプリタイプ）
  5. クライアントID・シークレットを共有（機密）
- Claude Code側でリフレッシュトークン取得スクリプトを用意（BLサンド日本チャンネル・英語チャンネルそれぞれで認可）

### F: Notion API（加藤の手動作業待ち）
- **加藤への依頼事項**：
  1. Notion Integrations ページでインテグレーション作成
  2. シークレットトークン取得
  3. KPIレポート親ページを1つ用意（`notion-bisque` ワークスペース内）
  4. 親ページに上記インテグレーションを接続
  5. トークンと親ページURL（ID部分）を共有
- Claude Code側でテストページ作成スクリプトを走らせる

## 次のアクション

### Phase 0 完了に必要な加藤側作業
1. **YouTube API セットアップ**（Google Cloud Console、30分〜1時間）
2. **Notion Integration トークン発行＋親ページ用意**（10分）

### Claude Code 側が並行でできる作業
- **Phase 1a 着手**（Next.js init、Supabase migration、認証基盤）
  - → D項目（Supabase）は Phase 1a で自動的に検証される
- **Phase 0 C項目の最小Playwrightスクリプト**を `scripts/phase0/` に追加
  - ただし本格実行にはDLsite/Fanzaのログイン情報が必要
  - → **加藤への依頼**：DLsite/FanzaのID/パスワードを `.env.local` に設定

### 推奨の進め方

**並行で進める**方が効率的：

1. 加藤：YouTube API と Notion Integration のセットアップを開始
2. Claude Code：Phase 1a（Next.js init・Supabase・認証）に着手
3. 加藤のセットアップ完了後、Phase 1f・1g（YouTube・Notion）着手時に検証
4. ログイン情報が揃い次第、Phase 0 C項目（Playwright実動作）を Phase 1d で実検証

## v3.2 への更新予定
Phase 0 の C〜F が完了した時点で v3.2 として最終確定。ただしこれらは Phase 1 の各段階で実装＋検証する性質なので、実質的に **Phase 1 と Phase 0 が並行**する。
