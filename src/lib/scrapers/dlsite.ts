import type { Page, Download } from 'playwright';
import { BaseScraper } from './base/scraper';
import { AuthError, SelectorNotFoundError, TimeoutError } from './base/errors';
import { DLSITE_SELECTORS } from './config/dlsite-selectors';

/**
 * DLsite サークル管理画面スクレイパー（v3.6 §5-2 準拠）
 * 操作フロー：
 *   1. ログイン（未ログイン時のみ）
 *   2. 売上確認ページへ
 *   3. 期間指定（サークル「すべて」・総合売上・販売サイト「すべて」固定）
 *   4. 「表示」→描画待ち
 *   5. 「CSVダウンロード」→ バイナリ取得
 */
export class DlsiteScraper extends BaseScraper {
  constructor(debug?: boolean) {
    super({ platform: 'dlsite', debug });
  }

  static readonly VERSION = DLSITE_SELECTORS.version;

  protected async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto(DLSITE_SELECTORS.salesPage.navUrls[0], { waitUntil: 'domcontentloaded' });
      // successIndicator のいずれか1つが見つかればログイン済み
      for (const sel of DLSITE_SELECTORS.login.successIndicator) {
        const visible = await this.page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  protected async performLogin(): Promise<void> {
    if (!this.page) throw new AuthError('ブラウザが起動していません');

    const username = process.env.DLSITE_USERNAME;
    const password = process.env.DLSITE_PASSWORD;
    if (!username || !password) {
      throw new AuthError('DLSITE_USERNAME / DLSITE_PASSWORD が環境変数に設定されていません');
    }

    await this.page.goto(DLSITE_SELECTORS.login.pageUrl, { waitUntil: 'domcontentloaded' });

    // ユーザー名入力欄を特定
    const usernameSel = await findFirstVisible(this.page, DLSITE_SELECTORS.login.usernameInput);
    if (!usernameSel) {
      throw new SelectorNotFoundError(DLSITE_SELECTORS.login.usernameInput.join(','), 'login.usernameInput');
    }
    await this.page.fill(usernameSel, username);

    const passwordSel = await findFirstVisible(this.page, DLSITE_SELECTORS.login.passwordInput);
    if (!passwordSel) {
      throw new SelectorNotFoundError(DLSITE_SELECTORS.login.passwordInput.join(','), 'login.passwordInput');
    }
    await this.page.fill(passwordSel, password);

    const submitSel = await findFirstVisible(this.page, DLSITE_SELECTORS.login.submitButton);
    if (!submitSel) {
      throw new SelectorNotFoundError(DLSITE_SELECTORS.login.submitButton.join(','), 'login.submitButton');
    }

    await Promise.all([
      this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
      this.page.click(submitSel),
    ]);

    // ログイン成功指標を確認
    let ok = false;
    for (const sel of DLSITE_SELECTORS.login.successIndicator) {
      const visible = await this.page.locator(sel).first().isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) { ok = true; break; }
    }
    if (!ok) {
      throw new AuthError('ログイン後のサイドバーを検出できません（ID/パスワード間違い、または画面構造の変化）');
    }
  }

  /**
   * 期間を指定して売上CSVをダウンロードする
   * @param from YYYY-MM-DD
   * @param to   YYYY-MM-DD
   * @returns CSVのバイナリ（CP932エンコード）
   */
  async fetchSalesCsv(from: string, to: string): Promise<Buffer> {
    if (!this.page) throw new Error('launch() を先に呼んでください');

    const page = this.page;

    // 売上確認ページへ
    let navigated = false;
    for (const url of DLSITE_SELECTORS.salesPage.navUrls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        navigated = true;
        break;
      } catch {
        // 次の候補を試す
      }
    }
    if (!navigated) throw new Error('売上確認ページに到達できません');

    // フィルタ設定
    await setSelectByLabelOrValue(page, DLSITE_SELECTORS.filterForm.circleSelect, DLSITE_SELECTORS.filterForm.circleValue, 'すべて');
    await setSelectByLabelOrValue(page, DLSITE_SELECTORS.filterForm.revenueTypeSelect, null, DLSITE_SELECTORS.filterForm.revenueTypeLabel);
    await setSelectByLabelOrValue(page, DLSITE_SELECTORS.filterForm.salesSiteSelect, DLSITE_SELECTORS.filterForm.salesSiteValue, 'すべて');
    await setSelectByLabelOrValue(page, DLSITE_SELECTORS.filterForm.periodTypeSelect, null, DLSITE_SELECTORS.filterForm.periodTypeLabel);

    // 日付入力
    const fromSel = await findFirstVisible(page, DLSITE_SELECTORS.filterForm.dateFromInput);
    const toSel = await findFirstVisible(page, DLSITE_SELECTORS.filterForm.dateToInput);
    if (!fromSel || !toSel) {
      throw new SelectorNotFoundError('dateFromInput / dateToInput', 'filterForm.date');
    }
    await page.fill(fromSel, from);
    await page.fill(toSel, to);

    // 「表示」ボタン
    const displaySel = await findFirstVisible(page, DLSITE_SELECTORS.filterForm.displayButton);
    if (!displaySel) {
      throw new SelectorNotFoundError('displayButton', 'filterForm.display');
    }
    await page.click(displaySel);

    // 結果描画待ち
    try {
      await page.locator(DLSITE_SELECTORS.result.loadedSignal).first().waitFor({ timeout: 15000 });
    } catch {
      throw new TimeoutError('result.loadedSignal', 15000);
    }

    // CSVダウンロード
    const csvSel = await findFirstVisible(page, DLSITE_SELECTORS.filterForm.csvDownloadButton);
    if (!csvSel) {
      throw new SelectorNotFoundError('csvDownloadButton', 'filterForm.csvDownload');
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click(csvSel),
    ]);
    return readDownload(download);
  }
}

async function findFirstVisible(page: Page, selectors: readonly string[] | string): Promise<string | null> {
  const arr = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of arr) {
    const visible = await page.locator(sel).first().isVisible({ timeout: 1500 }).catch(() => false);
    if (visible) return sel;
  }
  return null;
}

async function setSelectByLabelOrValue(
  page: Page,
  selectSelector: string,
  value: string | null,
  label: string | null
): Promise<void> {
  const exists = await page.locator(selectSelector).first().isVisible({ timeout: 2000 }).catch(() => false);
  if (!exists) return; // フィールドが存在しなければスキップ（UI差分吸収）

  const locator = page.locator(selectSelector).first();
  if (value !== null && value !== undefined) {
    try {
      await locator.selectOption({ value });
      return;
    } catch {
      /* fall through to label */
    }
  }
  if (label) {
    try {
      await locator.selectOption({ label });
    } catch {
      /* ignore */
    }
  }
}

async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('download stream is null');
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
