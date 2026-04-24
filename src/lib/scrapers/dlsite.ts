import type { Download } from 'playwright';
import { BaseScraper } from './base/scraper';
import { AuthError, SelectorNotFoundError, TimeoutError } from './base/errors';
import { DLSITE_SELECTORS } from './config/dlsite-selectors';

/**
 * DLsite サークル管理画面スクレイパー（v3.6 §5-2 準拠、実動作検証済み）
 *
 * 操作フロー：
 *   1. `play.dlsite.com/home/circle/` にアクセス → viviON ID ログインへリダイレクト
 *   2. ログインフォームに ID/パスワード入力して submit
 *   3. `/circle/circle/sale/result` へ遷移
 *   4. フィルタ設定（サークル「すべて」・販売サイト「すべて」・総合売上・日付指定）
 *   5. 「CSVダウンロード」ボタンをクリック（form action=/index.php 直接 POST）
 *   6. Download イベントからバイナリ取得（CP932）
 */
export class DlsiteScraper extends BaseScraper {
  constructor(debug?: boolean) {
    super({ platform: 'dlsite', debug });
  }

  static readonly VERSION = DLSITE_SELECTORS.version;

  /**
   * 売上ページにアクセスして、ログイン画面が出ていないかを判定
   * ログイン済みなら form#sales_list が見つかる
   */
  protected async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto(DLSITE_SELECTORS.salesPage.url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      // form#sales_list があればログイン済み
      const exists = await this.page
        .locator('form#sales_list')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      return exists;
    } catch {
      return false;
    }
  }

  protected async performLogin(): Promise<void> {
    if (!this.page) throw new AuthError('ブラウザが起動していません');

    const username = process.env.DLSITE_USERNAME;
    const password = process.env.DLSITE_PASSWORD;
    if (!username || !password) {
      throw new AuthError('DLSITE_USERNAME / DLSITE_PASSWORD が環境変数にありません');
    }

    // 保護ページにアクセス → viviON ID にリダイレクト
    // networkidle まで待つことで SPA 初期化完了を保証
    await this.page.goto(DLSITE_SELECTORS.login.protectedPageUrl, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await this.page.waitForTimeout(3000);

    // ログインフォーム待機（30秒までレンダリングを待つ）
    const idLocator = this.page.locator(DLSITE_SELECTORS.login.usernameInput);
    if (!(await idLocator.first().isVisible({ timeout: 30000 }).catch(() => false))) {
      // 真因切り分け用：失敗時に現在URLと HTMLの先頭1500文字を stderr 出力
      const currentUrl = this.page.url();
      const htmlSnippet = await this.page.content().catch(() => '<content read failed>');
      console.error(`[dlsite] login page not rendered. url=${currentUrl}`);
      console.error(`[dlsite] html(head 1500): ${htmlSnippet.slice(0, 1500)}`);
      throw new SelectorNotFoundError(DLSITE_SELECTORS.login.usernameInput, 'login.usernameInput');
    }

    await idLocator.first().fill(username);
    await this.page.locator(DLSITE_SELECTORS.login.passwordInput).first().fill(password);
    await this.page.locator(DLSITE_SELECTORS.login.submitButton).first().click();

    // ログイン後の遷移待ち
    await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await this.page.waitForTimeout(3000);

    // 売上ページへ遷移して form#sales_list の存在で成功判定
    const ok = await this.isLoggedIn();
    if (!ok) {
      throw new AuthError('ログイン後に売上ページ（form#sales_list）を検出できません');
    }
  }

  /**
   * 期間を指定して売上CSVをダウンロード
   * @param from YYYY-MM-DD
   * @param to   YYYY-MM-DD
   * @returns CSV バイナリ（CP932）
   */
  async fetchSalesCsv(from: string, to: string): Promise<Buffer> {
    if (!this.page) throw new Error('launch() を先に呼んでください');
    const page = this.page;

    // 売上ページへ（ログイン済みCookie前提）
    await page.goto(DLSITE_SELECTORS.salesPage.url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(2000);

    // form が見えるか
    const formOk = await page
      .locator('form#sales_list')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!formOk) throw new SelectorNotFoundError('form#sales_list', 'salesPage.form');

    const sel = DLSITE_SELECTORS.filterForm;

    // フィルタ設定：すべて・総合売上・日付指定
    await page.locator(sel.circleSelect).selectOption({ value: sel.circleAllValue });
    await page.locator(sel.marketPlaceSelect).selectOption({ value: sel.marketPlaceAllValue });
    await page.locator(sel.salesTypeSelect).selectOption({ value: sel.salesTypeDefaultValue });
    await page.locator(sel.termTypeSelect).selectOption({ value: sel.termTypeDateValue });

    // 日付入力（date 選択後に表示される、flatpickr 管理のフィールド）
    // flatpickr はイベント経由でのみ値更新するので、dispatchEvent + blur で確定
    await page.waitForTimeout(500);
    await setFlatpickrDate(page, sel.dateStartInput, from);
    await setFlatpickrDate(page, sel.dateEndInput, to);

    // 開いたままのカレンダーを閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => {});
    await page.waitForTimeout(300);

    // 「表示」を先にクリックして結果ページを確定させる（2段階フロー）
    await page.locator(sel.displayButton).first().click();
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 再度 CSV ボタンの存在を確認し、クリック
    const csvBtn = page.locator(sel.csvDownloadButton).first();
    const csvVisible = await csvBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!csvVisible) {
      throw new SelectorNotFoundError(sel.csvDownloadButton, 'csvDownloadButton (after display)');
    }

    // CSVダウンロードボタンをクリック → download イベント待ち
    let download: Download;
    try {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        csvBtn.click(),
      ]);
    } catch (e) {
      // download イベントが来ない場合はセレクタorタイムアウトの問題
      if (e instanceof Error && /Timeout/i.test(e.message)) {
        throw new TimeoutError('csvDownload.event', 30000);
      }
      throw e;
    }

    return readDownload(download);
  }
}

/**
 * flatpickr が管理する日付入力に値を確実に反映させる
 */
async function setFlatpickrDate(
  page: import('playwright').Page,
  selector: string,
  value: string
): Promise<void> {
  // flatpickr インスタンス経由で setDate を呼ぶのが最も確実
  const set = await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return { ok: false, reason: 'element not found' };

      // flatpickr インスタンスが要素に紐付いている場合
      const fp = (el as unknown as { _flatpickr?: { setDate: (d: string) => void } })._flatpickr;
      if (fp && typeof fp.setDate === 'function') {
        fp.setDate(v);
        return { ok: true, via: 'flatpickr' };
      }

      // フォールバック: value セット + input/change イベント
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, via: 'fallback' };
    },
    { sel: selector, v: value }
  );
  if (!set.ok) throw new Error(`setFlatpickrDate failed for ${selector}: ${set.reason ?? 'unknown'}`);
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
