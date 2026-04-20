/**
 * DLsite セレクター定義ドラフト（Phase 0）
 *
 * スクリーンショット（2026-04-20）からの推定値。
 * Phase 0で実際にPlaywrightを走らせて正確なセレクターを確定する。
 *
 * 画面URL: https://www.dlsite.com/home/circle/  配下の売上確認ページ
 *   （正確なURLはブラウザで開いてから要確認。トップのサイドメニュー「売上確認」に該当）
 *
 * 操作フロー（スクリーンショットから読み取り）:
 *   1. ログイン（サークル管理画面の認証）
 *   2. 売上確認ページへ遷移
 *   3. サークル選択: 「すべて」既定
 *   4. 売上区分: 「総合売上」既定
 *   5. 販売サイト: 「すべて」既定
 *   6. 期間: 「日付を指定する」を選択
 *   7. from日付、to日付をセット
 *   8. 「表示」ボタンをクリック
 *   9. 結果が描画されたら「CSVダウンロード」ボタンでDL
 */

export const DLSITE_SELECTORS = {
  version: '2026-04-20-draft',

  login: {
    pageUrl: 'https://www.dlsite.com/home/circle/login', // 要確認: 実ログインURL
    usernameInput: 'input[name="login_id"]',             // 要確認
    passwordInput: 'input[name="password"]',             // 要確認
    submitButton: 'button[type="submit"]',               // 要確認
    // ログイン成功指標: サイドバーに「売上確認」メニューが出ていること
    successIndicator: 'text=売上確認',
  },

  salesPage: {
    // スクリーンショット上ではサイドバー「売上確認」→サブメニュー「売上一覧」等をクリック
    navUrl: 'https://www.dlsite.com/home/circle/sales',  // 要確認
    navLink: 'a:has-text("売上確認")',                   // 要確認
  },

  filterForm: {
    // スクリーンショットで確認できたフォーム要素（セレクターは推測）
    circleSelect: 'select[name="circle_id"]',            // 「サークル：すべて」
    revenueTypeSelect: 'select[name="revenue_type"]',    // 「売上区分：総合売上」
    salesSiteSelect: 'select[name="sales_site"]',        // 「販売サイト：すべて」
    periodTypeSelect: 'select[name="period_type"]',      // 「日付を指定する」を選択
    periodTypeValue: '日付を指定する',
    dateFromInput: 'input[name="date_from"]',            // yyyy-mm-dd 形式
    dateToInput: 'input[name="date_to"]',
    displayButton: 'button:has-text("表示")',
    csvDownloadButton: 'button:has-text("CSVダウンロード")',
  },

  result: {
    // 結果テーブル・チャートのロード完了を検知
    totalSalesCount: 'text=/[0-9,]+本/',                 // 「3,088本」等
    totalRevenueJpy: 'text=/[0-9,]+円/',                 // 「2,325,042円」等
  },

  /**
   * 日次取得の例: 2026-04-20の1日分
   *   dateFrom: '2026-04-20'
   *   dateTo:   '2026-04-20'
   *
   * 月次取得の例: 2026-04
   *   dateFrom: '2026-04-01'
   *   dateTo:   '2026-04-30'
   */
} as const;
