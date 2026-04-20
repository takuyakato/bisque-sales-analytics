/**
 * Fanza セレクター定義ドラフト（Phase 0）
 *
 * スクリーンショット（2026-04-20）からの推定値。
 * Phase 0で実際にPlaywrightを走らせて正確なセレクターを確定する。
 *
 * 画面URL: https://dojin.dmm.co.jp/sales/all/catalog
 *   （スクリーンショットのURLバーで確認済み）
 *
 * 操作フロー（スクリーンショットから読み取り）:
 *   1. Fanza同人サークル管理画面にログイン
 *   2. https://dojin.dmm.co.jp/sales/all/catalog にアクセス
 *   3. 商品売上タブがアクティブ（PC売上/スマートフォン売上と切替可能）
 *   4. サークル選択: 「すべて」
 *   5. 期間: 「日付を指定する」＋from/to日付
 *   6. 「表示」ボタンをクリック
 *   7. 結果が表示されたら「詳しいCSVダウンロード」ボタンでDL
 */

export const FANZA_SELECTORS = {
  version: '2026-04-20-draft',

  login: {
    pageUrl: 'https://accounts.dmm.co.jp/service/login/password',  // 要確認: サークル管理向けログインURL
    usernameInput: 'input[name="login_id"]',                       // 要確認
    passwordInput: 'input[name="password"]',                       // 要確認
    submitButton: 'button[type="submit"]',                         // 要確認
    // ログイン成功指標: 売上カタログページに遷移できる
    successIndicator: 'text=商品売上',
  },

  salesPage: {
    navUrl: 'https://dojin.dmm.co.jp/sales/all/catalog',           // 確認済み
    // タブ: 商品売上 / PC売上 / スマートフォン売上
    productSalesTab: 'button:has-text("商品売上")',                // デフォルトでアクティブ
  },

  filterForm: {
    circleSelect: 'select[name="circle_id"]',                      // 「サークル選択：すべて」
    periodTypeSelect: 'select[name="period_type"]',                // 「日付を指定する」
    periodTypeValue: '日付を指定する',
    dateFromInput: 'input[name="date_from"]',                      // yyyy/mm/dd 形式？要確認
    dateToInput: 'input[name="date_to"]',
    displayButton: 'button:has-text("表示")',
    csvDownloadButton: 'button:has-text("詳しいCSVダウンロード")',
  },

  result: {
    chartTitle: 'text=/[0-9]{4}-[0-9]{2}-[0-9]{2}〜[0-9]{4}-[0-9]{2}-[0-9]{2}/', // 「2026-04-01〜2026-04-19」等
  },

  /**
   * 日次取得の例: 2026-04-20の1日分
   *   dateFrom: '2026-04-20'
   *   dateTo:   '2026-04-20'
   *
   * 月次取得の例: 2026-04
   *   dateFrom: '2026-04-01'
   *   dateTo:   '2026-04-30'
   *
   * 備考: ファイル名の命名規則は sales_all_0_YYYYMMDD_YYYYMMDD.csv
   *   取得後、ファイル名から期間を自動抽出可能
   */
} as const;
