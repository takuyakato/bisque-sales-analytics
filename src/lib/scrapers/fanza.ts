import type { Download, Page } from 'playwright';
import iconv from 'iconv-lite';
import { BaseScraper } from './base/scraper';
import { AuthError, SelectorNotFoundError, TimeoutError } from './base/errors';
import { FANZA_SELECTORS } from './config/fanza-selectors';

const FANZA_EMPTY_CSV_HEADER =
  'サークル名,作品ID,作品名,単価,卸金額,販売数,販売金額合計,卸金額合計,期間(From),期間(to)\n';

function emptyCsvBuffer(): Buffer {
  return iconv.encode(FANZA_EMPTY_CSV_HEADER, 'cp932');
}

/**
 * Fanza（DMM同人）サークル管理画面スクレイパー（v3.6 §5-2 準拠）
 *
 * 操作フロー：
 *   1. 売上ページ `dojin.dmm.co.jp/sales/all/catalog` にアクセス
 *   2. 年齢ゲート（age_check）が出たら「はい」をクリックして通過
 *   3. ログインフォームが出たらDMMアカウントでログイン
 *   4. 売上ページに到達したらフィルタ設定（circle_id="all"、period_type="Calendar"、date_from/to）
 *   5. 「表示」ボタンをクリック（JS駆動）
 *   6. 「CSVダウンロード」ボタンをクリック → download イベントから CSV バイナリ取得
 */
export class FanzaScraper extends BaseScraper {
  constructor(debug?: boolean) {
    super({ platform: 'fanza', debug });
  }

  static readonly VERSION = FANZA_SELECTORS.version;

  /**
   * 売上ページに到達できればログイン済み
   */
  protected async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto(FANZA_SELECTORS.salesPage.url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await this.page.waitForTimeout(2000);
      await passAgeGate(this.page);
      await this.page.waitForTimeout(2000);

      return await this.page
        .locator(FANZA_SELECTORS.salesPage.loadedSignal)
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);
    } catch {
      return false;
    }
  }

  protected async performLogin(): Promise<void> {
    if (!this.page) throw new AuthError('ブラウザが起動していません');

    const username = process.env.FANZA_USERNAME;
    const password = process.env.FANZA_PASSWORD;
    if (!username || !password) {
      throw new AuthError('FANZA_USERNAME / FANZA_PASSWORD が環境変数にありません');
    }

    // 売上ページ → 年齢ゲート → ログイン の順で遷移する
    await this.page.goto(FANZA_SELECTORS.salesPage.url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await this.page.waitForTimeout(2500);
    await passAgeGate(this.page);
    await this.page.waitForTimeout(2500);

    // ログインフォームが表示されているか
    const idSel = await findFirstVisible(this.page, FANZA_SELECTORS.login.usernameInput);
    const pwSel = await findFirstVisible(this.page, FANZA_SELECTORS.login.passwordInput);

    if (idSel && pwSel) {
      await this.page.fill(idSel, username);
      await this.page.fill(pwSel, password);

      const submitSel = await findFirstVisible(this.page, FANZA_SELECTORS.login.submitButton);
      if (!submitSel) {
        throw new SelectorNotFoundError(FANZA_SELECTORS.login.submitButton.join(','), 'login.submit');
      }
      await this.page.locator(submitSel).first().click();
      await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await this.page.waitForTimeout(4000);

      // 年齢ゲートが再度出るケースに対応
      await passAgeGate(this.page);
      await this.page.waitForTimeout(2000);
    } else {
      // ログインフォームが既にない＝既にログイン済み（セッション確立）
      // フォールバック確認として、売上ページに直接いるかを見る
    }

    // 売上ページの目印を確認
    const sigOk = await this.page
      .locator(FANZA_SELECTORS.salesPage.loadedSignal)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!sigOk) {
      throw new AuthError('ログイン後に売上ページ（select[name="circle_id"]）を検出できません');
    }
  }

  /**
   * 期間を指定して売上CSVをダウンロード
   * @param from YYYY-MM-DD（内部形式）
   * @param to   YYYY-MM-DD
   * @returns CSV バイナリ（CP932）
   */
  async fetchSalesCsv(from: string, to: string): Promise<Buffer> {
    if (!this.page) throw new Error('launch() を先に呼んでください');
    const page = this.page;

    // 売上ページへ
    await page.goto(FANZA_SELECTORS.salesPage.url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(2000);
    await passAgeGate(page);
    await page.waitForTimeout(2000);

    // select が見えるか
    const sigOk = await page
      .locator(FANZA_SELECTORS.salesPage.loadedSignal)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!sigOk) throw new SelectorNotFoundError(FANZA_SELECTORS.salesPage.loadedSignal, 'salesPage');

    const sel = FANZA_SELECTORS.filterForm;

    // フィルタ設定
    await page.locator(sel.circleSelect).selectOption({ value: sel.circleAllValue });
    await page.locator(sel.periodSelect).selectOption({ value: sel.periodCalendarValue });
    await page.waitForTimeout(500);

    // 日付入力（Fanza は YYYY/MM/DD 形式）
    const fromSlash = from.replace(/-/g, '/');
    const toSlash = to.replace(/-/g, '/');
    await setInputValue(page, sel.dateFromInput, fromSlash);
    await setInputValue(page, sel.dateToInput, toSlash);

    // 「表示」ボタン（JS駆動）
    await page.locator(sel.displayButton).first().click();
    await page.waitForTimeout(4000);

    // 「該当作品なし」判定：テーブルに「該当作品：0作品」などが出ていたら、CSV空として扱う
    const hasNoData = await page
      .locator('text=/該当作品[：:]\\s*0/, text=/検索条件に一致する作品がありません/')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (hasNoData) {
      return emptyCsvBuffer();
    }

    // CSVダウンロード
    const csvBtn = page.locator(sel.csvDownloadButton).first();
    const csvVisible = await csvBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!csvVisible) {
      throw new SelectorNotFoundError(sel.csvDownloadButton, 'csvDownloadButton');
    }

    // disabled なら空CSV扱い
    const disabled = await csvBtn.evaluate((el) => (el as HTMLButtonElement).disabled).catch(() => false);
    if (disabled) {
      return emptyCsvBuffer();
    }

    let download: Download;
    try {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        csvBtn.click(),
      ]);
    } catch (e) {
      if (e instanceof Error && /Timeout/i.test(e.message)) {
        throw new TimeoutError('csvDownload.event', 30000);
      }
      throw e;
    }

    return readDownload(download);
  }
}

/**
 * 年齢ゲート通過ヘルパー
 */
async function passAgeGate(page: Page): Promise<void> {
  const url = page.url();
  if (!FANZA_SELECTORS.ageGate.urlPattern.test(url)) return;

  const yesLink = page.locator(FANZA_SELECTORS.ageGate.yesLink).first();
  if (await yesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null),
      yesLink.click(),
    ]);
    return;
  }

  // フォールバック：rurl パラメータから戻り先を取得
  const m = url.match(/rurl=([^&]+)/);
  if (m) {
    const returnUrl = decodeURIComponent(m[1]);
    await page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  }
}

async function findFirstVisible(page: Page, selectors: readonly string[] | string): Promise<string | null> {
  const arr = Array.isArray(selectors) ? selectors : [selectors];
  for (const s of arr) {
    const visible = await page.locator(s).first().isVisible({ timeout: 1500 }).catch(() => false);
    if (visible) return s;
  }
  return null;
}

/**
 * input value を確実にセット（flatpickr や Vue が入っている可能性に備える）
 */
async function setInputValue(page: Page, selector: string, value: string): Promise<void> {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return;
      // flatpickr があれば setDate
      const fp = (el as unknown as { _flatpickr?: { setDate: (d: string) => void } })._flatpickr;
      if (fp && typeof fp.setDate === 'function') {
        fp.setDate(v);
      } else {
        el.value = v;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    },
    { sel: selector, v: value }
  );
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
