# SPEC: 着地見込みのデータ鮮度差対応（方式3・PF別窓）

## 目的
プラットフォーム（PF）ごとのデータ確定ラグ（DLsite 1日／Fanza 2日／YouTube 3日）により、着地見込みが恒常的に過小になるバイアスを除去する。方式はバックテスト（scripts/forecast-backtest.ts、結果はコミット済み）で選定済みの**方式3（PF別窓）**。全体方針は `deep-think_着地見込み鮮度差対応_2026-07-18.md` §結論（合格済み）に従う。

## 変更対象
- 新規：`src/lib/queries/forecast.ts`（共通計算モジュール）、`scripts/forecast-test.ts`（不変条件テスト）
- 変更：`src/lib/queries/dashboard.ts`（KPI:143近辺／チャート:459-495近辺／前月比較:129近辺）、`src/lib/queries/monthly-report.ts`（290-312近辺とルックバック取得167-173近辺）、上記の値を表示するUIコンポーネント（KPIカード・月次レポートの見込み表示・MonthlyForecastChart への受け渡し部）、必要な型定義（KpiData / MonthlyChartData / MonthlyReportData 等）
- `scripts/forecast-backtest.ts` は参照のみ（変更禁止）

## 要求仕様

### 1. 共通計算モジュール `computeForecast()`
純粋関数として実装（DB非依存。入力は行配列とオプション）：

```
入力: rows: { sale_date: 'YYYY-MM-DD', platform: 'dlsite'|'fanza'|'youtube',
              brand: string|null, language: string|null, revenue: number }[]
      （前月初〜最新日までを含むこと。呼び出し側が取得）
      opts: { year, month, todayJst: 'YYYY-MM-DD' }
出力: {
  expectedMonthEndJpy: number | null,   // 総額（実績成分＋テール）。invalid時はnull
  actualJpy: number,                    // Σ actual_cell
  forecastTailJpy: number,              // Σ tail_cell（将来分のみ）
  forecastTailByPlatform: { dlsite, fanza, youtube },
  forecastTailByBrand: { CAPURI, BerryFeel, BLsand },      // unknownは含めない（既存UI形状維持）
  forecastTailByBrandLanguage: { [brand]: { 日本語, 英語, 中国語, 韓国語 } },
  freshness: { dlsite: 'YYYY-MM-DD'|null, fanza: …, youtube: … },   // 各PFのC_p
  sla: { dlsite: 'ok'|'warning'|'invalid', fanza: …, youtube: … },
}
```

計算（deep-thinkレポート§結論1〜4のとおり）：
1. **確定日 C_p**：dlsite/fanza = そのPFの MAX(sale_date)。youtube = 言語パーティション別 MAX(sale_date) の最小値（言語はrows内でplatform='youtube'に実在するもの。片チャンネル遅延で確定日を過大認定しないため）
2. **最小セル** = PF × ブランド × 言語。ブランドがCAPURI/BerryFeel/BLsand以外・言語が4言語以外は 'unknown' バケットに入れる（全行が必ずどこかのセルに属する）
3. セルごとに：`rate = [C_p−2, C_p] の3暦日の売上合計 ÷ 3`（レコード不存在日は0円として扱う暦日ゼロ埋め。窓が前月にかかってよい）／`actual = 対象月初〜C_p の合計`（C_p より後の行は実績に入れない）／`tailDays = C_p が月内なら 月末日−C_p の実日付差、C_p < 月初なら当月日数、C_p が月末日なら 0`／`tail = rate × tailDays`
4. すべての集計値（全体・PF別・ブランド別・ブランド×言語別）はこのセルの和からのみ導出する（合算整合を構造的に保証）。PF別テールの合計 = forecastTailJpy が常に成立すること
5. **SLA**：`expectedLag = { dlsite: 1, fanza: 2, youtube: 3 }`、`age_p = todayJst − C_p`（日数）。`age_p > expectedLag+2` で warning、`age_p > expectedLag+5` で invalid。**いずれかのPFが invalid のとき expectedMonthEndJpy = null**（テール・実績・freshness は返す）。C_p が null（データ皆無）のPFも invalid
6. 見込み計算は現在月のみ（過去月は従来どおり実績のみ）

### 2. 3経路の置き換え
- dashboard.ts の KPI `expectedMonthEndJpy`（143近辺）、チャート用 `forecastTailJpy`/`forecastByPlatform`/`forecastByBrand`/`forecastByBrandLanguage`（459-495）、monthly-report.ts の `expectedMonthEndJpy`（290-312）を、すべて `computeForecast()` の結果に置き換える。旧ロジック（存在日 `slice(-3)` 平均）は削除する
- チャート（MonthlyForecastChart）へは従来どおり**テール（将来分）のみ**を渡す。KPI・月次レポートは総額を表示する（契約の混同を起こさない）
- monthly-report.ts の前月ルックバック取得（167-173近辺）に platform / brand / language 列を追加する（computeForecast の入力要件を満たすため）

### 3. 当月累計の前月比較の as-of 揃え
dashboard の「今月累計」の前月比較（129近辺）を修正：前月実績を PF ごとに「前月の1日〜day(C_p) と同じ日数まで」で打ち切って合算した値と比較する（現在は前月が当日まで入るため恒常的に不利な比較になっている）。前年比較が同様の構造で存在する場合も同じ扱いにする。

### 4. UI
- KPIの「今月着地見込み」と月次レポートの見込みの近くに鮮度を小さく表示：例「反映済: DLsite 7/17・Fanza 7/16・YouTube 7/15」（freshness から生成、月表示は M/D でよい）
- warning のPFがあれば黄色系バッジ：「YouTubeのデータがN日更新されていません」
- invalid 時は見込み値を「—」表示＋「データ停止のため算出不可」。実績値と鮮度表示は出し続ける
- 既存のデザイントーン・コンポーネント（shadcn/ui, Tailwind）に合わせ、派手な改装はしない

### 5. 不変条件テスト `scripts/forecast-test.ts`
node:assert ベース、DB接続なしで `npx tsx scripts/forecast-test.ts` 完走。合成データで最低限以下をカバー：
1. 全軸合算一致（PF別テール合計＝全体テール、ブランド別＋unknown＝全体、ブランド×言語も同様）
2. 月初：全PFのC_pが前月 → actual=0、tailDays=当月日数、窓が前月データを使う
3. 疎セル（月内に数日しか売上がないブランド×言語）が過大予測にならない（暦日ゼロ埋めの検証）
4. YouTube片言語欠損：ja=7/17まで・en=7/15までなら C_youtube=7/15、7/16-17のja実績は実績成分に入らない
5. 確定済みゼロ売上日（C_p以下でレコードなし）が rate を正しく下げる
6. 月末最終日：C_p=月末 → tail=0、総額=実績
7. SLA境界：age=lag+2はok/warning境界、lag+5でinvalid、invalid時 expectedMonthEndJpy=null
8. 総額＝actualJpy＋forecastTailJpy（invalid以外）
9. クロスチェック：forecast-backtest.ts の方式3と同一の合成入力でPF粒度の見込みが一致する

## スコープ外（やらないこと）
- ウォーターマークテーブル・DLsiteスクレイプ3日窓化・MV更新失敗の可視化（Phase 2、別発注）
- 予測モデルの高度化（曜日調整等）
- 取込側（scripts/、.github/workflows/）の変更
- monthly-report の「見込み vs 前月合計」比較（expectedVsPrevMonthPct）の意味変更（総額同士の比較のままでよい）

## 受け入れ基準
- [ ] `npx tsx scripts/forecast-test.ts` が全assert成功（上記9件）
- [ ] `npx tsc --noEmit` 成功
- [ ] `npm run build` 成功（Claude側で実行）
- [ ] `grep -n "slice(-3)" src/lib/queries/` で見込み用の旧ロジックが残っていない
- [ ] ダッシュボードと月次レポートに鮮度表示が出る（Claude側でブラウザ確認）
- [ ] チャートの積み上げで実績が二重計上されない（見込み総額 = 実績＋テールをブラウザで目視確認）
- [ ] git diff が「変更対象」記載のファイルのみ

## 動作確認方法
- Codex側（ネットワーク不可）：`npx tsx scripts/forecast-test.ts`／`npx tsc --noEmit`／`git diff --stat`
- Claude側：`npm run build`→`npm run dev`でBrowser Use確認（KPI・月次レポート・チャート）→本番デプロイ

## 制約・注意
- 日付演算はJST基準・文字列 'YYYY-MM-DD' 比較の既存流儀に合わせる（タイムゾーンでズレを作らない）
- `daily_breakdown_summary` 等の既存クエリソースは変更しない（読み方の変更のみ）
- RPC・migration・依存パッケージの追加は不可
- 既存のキャッシュ（unstable_cache等があれば）の枠組みは維持する
