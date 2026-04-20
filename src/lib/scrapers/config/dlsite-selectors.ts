/**
 * DLsite セレクター定義（v3.6準拠）
 *
 * Phase 0 の draft（scripts/phase0/config/dlsite-selectors.draft.ts）を本体に昇格。
 * UI変更時はこのファイルだけ直す。version を更新すると ingestion_log.source_version で追跡される。
 *
 * 操作フロー（スクリーンショットから確定）:
 *   1. ログイン（サークル管理画面の認証）
 *   2. 売上確認ページへ遷移（dlsite.com/index.php）
 *   3. サークル選択: 「すべて」
 *   4. 売上区分: 「総合売上」
 *   5. 販売サイト: 「すべて」
 *   6. 期間: 「日付を指定する」を選択
 *   7. from日付、to日付をセット
 *   8. 「表示」ボタンをクリック
 *   9. 結果表示後に「CSVダウンロード」ボタンでDL
 */

export const DLSITE_SELECTORS = {
  version: '2026-04-20',

  login: {
    pageUrl: 'https://play.dlsite.com/home/circle/=/login',
    // フォールバック：サークル管理トップにアクセスすれば未ログインならログインフォームに飛ばされる
    fallbackUrl: 'https://play.dlsite.com/',
    usernameInput: [
      'input[name="login_id"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[id*="login"]',
    ],
    passwordInput: ['input[name="password"]', 'input[type="password"]'],
    submitButton: [
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'input[type="submit"]',
    ],
    // ログイン成功指標：サイドバーの「売上確認」
    successIndicator: [
      'text=売上確認',
      'text=作品管理',
      '[href*="circle"][href*="index"]',
    ],
  },

  salesPage: {
    // 売上確認画面の直URL（複数候補）
    navUrls: [
      'https://play.dlsite.com/home/circle/=/index',
      'https://play.dlsite.com/home/circle/=/index.php',
    ],
    navLink: 'a:has-text("売上確認")',
  },

  filterForm: {
    circleSelect: 'select[name="circle_id"]',
    circleValue: '',
    revenueTypeSelect: 'select[name="revenue_type"]',
    revenueTypeLabel: '総合売上',
    salesSiteSelect: 'select[name="sales_site"]',
    salesSiteValue: '',
    periodTypeSelect: 'select[name="period_type"]',
    periodTypeLabel: '日付を指定する',
    dateFromInput: ['input[name="date_from"]', 'input[name="start_date"]'],
    dateToInput: ['input[name="date_to"]', 'input[name="end_date"]'],
    displayButton: ['button:has-text("表示")', 'input[type="submit"][value="表示"]'],
    csvDownloadButton: [
      'button:has-text("CSVダウンロード")',
      'a:has-text("CSVダウンロード")',
      'button:has-text("CSV")',
    ],
  },

  /**
   * 結果テーブル描画完了のサイン
   * 「N本」「N円」のような数字テキストが現れれば描画済みと判定
   */
  result: {
    loadedSignal: 'text=/[0-9,]+[本円]/',
  },
} as const;
