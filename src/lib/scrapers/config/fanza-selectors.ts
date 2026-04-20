/**
 * Fanza (DMM同人) セレクター定義（v3.6準拠、実動作検証済み）
 *
 * 実測で判明した構造:
 *   - 保護ページ直接アクセス時に年齢ゲート（age_check）を挟む → 「はい」リンクで通過
 *   - 売上ページ: https://dojin.dmm.co.jp/sales/all/catalog
 *   - select[name="circle_id"]: value="all" が「すべて」
 *   - select[name="period_type"]: value="Calendar" が「日付を指定する」
 *   - input[name="date_from"] / input[name="date_to"] は YYYY/MM/DD 形式（DLsite と違う）
 *   - 表示ボタン: <input type="button" id="search" value="表示">（JS起動、form submit ではない）
 *   - CSVダウンロードボタン: <button id="download">CSVダウンロード</button>
 *   - 商品売上タブがデフォルト（/sales/all/catalog のパスで all = 商品売上相当）
 */

export const FANZA_SELECTORS = {
  version: '2026-04-21',

  login: {
    // ログインURL は accounts.dmm.co.jp 系。ただし保護ページアクセス時に自動リダイレクト
    salesUrl: 'https://dojin.dmm.co.jp/sales/all/catalog',
    usernameInput: [
      'input[name="login_id"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[name="u_id"]',
    ],
    passwordInput: ['input[name="password"]', 'input[type="password"]'],
    submitButton: [
      'button:has-text("ログイン")',
      'input[type="submit"][value*="ログイン"]',
      'button[type="submit"]',
    ],
  },

  ageGate: {
    // 年齢認証ページのマーカー
    urlPattern: /age_check/,
    yesLink: 'a:has-text("はい")',
  },

  salesPage: {
    url: 'https://dojin.dmm.co.jp/sales/all/catalog',
    // 商品売上タブがアクティブである目印（select[name="circle_id"] の存在）
    loadedSignal: 'select[name="circle_id"]',
  },

  filterForm: {
    circleSelect: 'select[name="circle_id"]',
    circleAllValue: 'all',
    periodSelect: 'select[name="period_type"]',
    periodCalendarValue: 'Calendar',
    dateFromInput: 'input[name="date_from"]',
    dateToInput: 'input[name="date_to"]',
    displayButton: 'input#search[type="button"], input#search',
    csvDownloadButton: 'button#download',
  },
} as const;
