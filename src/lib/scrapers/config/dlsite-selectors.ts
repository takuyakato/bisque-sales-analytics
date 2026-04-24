/**
 * DLsite セレクター定義（v3.6準拠、実動作検証済み）
 *
 * 実測で判明した構造:
 *   - ログイン: 保護ページ `play.dlsite.com/home/circle/` へアクセス → viviON ID にリダイレクト
 *     - input[name="login_id"] / input[name="password"]
 *     - button:has-text("ログイン")
 *   - 売上ページ: https://www.dlsite.com/circle/circle/sale/result
 *     - form#sales_list（action="https://www.dlsite.com/index.php" method="post"）
 *     - セレクト: circle_list, market_place, sales_type, term_type
 *     - 日付: input[name="date_start"] / input[name="date_end"]
 *     - ボタン: input[name="search"][value="表示"] と input[name="csv"][value="CSVダウンロード"]（両方同一フォーム内）
 *
 * UI変更時はこのファイルだけ直す。version を更新すると ingestion_log.source_version で追跡される。
 */

export const DLSITE_SELECTORS = {
  version: '2026-04-25',

  login: {
    // 保護ページへアクセスすると viviON ID ログインにリダイレクト
    protectedPageUrl: 'https://play.dlsite.com/home/circle/',
    usernameInput: 'input[name="login_id"]',
    passwordInput: 'input[name="password"]',
    submitButton: 'button:has-text("ログイン")',
    // ログイン成功指標：URL が /library 等へ変わる、もしくはログインフォームが消える
  },

  salesPage: {
    url: 'https://www.dlsite.com/circle/circle/sale/result',
  },

  filterForm: {
    circleSelect: 'select[name="circle_list"]',
    circleAllValue: '0', // 「すべて」
    marketPlaceSelect: 'select[name="market_place"]',
    marketPlaceAllValue: '0',
    salesTypeSelect: 'select[name="sales_type"]',
    salesTypeDefaultValue: '0', // 総合売上
    termTypeSelect: 'select[name="term_type"]',
    termTypeDateValue: 'date', // 日付を指定する
    dateStartInput: 'input[name="date_start"]',
    dateEndInput: 'input[name="date_end"]',
    displayButton: 'input[type="submit"][name="search"]',
    csvDownloadButton: 'input[type="submit"][name="csv"]',
  },

  // 結果描画完了のサイン（売上数字が出る）
  result: {
    loadedSignal: 'text=/[0-9,]+\\s*[本円]/',
  },
} as const;
