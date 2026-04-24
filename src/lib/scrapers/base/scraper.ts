import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createServiceClient } from '@/lib/supabase/service';
import { loadSession, saveSession, clearSession } from './session-cache';
import { ScraperError } from './errors';

const ERROR_BUCKET = 'scraper-errors';

export interface ScraperInit {
  platform: 'dlsite' | 'fanza';
  headless?: boolean;
  debug?: boolean;
}

/**
 * スクレイパー基底クラス（v3.6 §5-2 準拠）
 * Playwright起動・ログイン・リトライ・失敗時スクショをカプセル化
 */
export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected platform: 'dlsite' | 'fanza';
  protected headless: boolean;
  protected debug: boolean;

  constructor(init: ScraperInit) {
    this.platform = init.platform;
    this.debug = init.debug ?? process.env.DEBUG_SCRAPER === '1';
    this.headless = init.headless ?? !this.debug;
  }

  /**
   * Playwright起動＋セッション復元
   * bot検出回避のための stealth 対策も同時に適用：
   *   - --disable-blink-features=AutomationControlled（webdriver flag を消す起動引数）
   *   - 通常の Chrome 相当の User-Agent を明示（chromium-headless-shell の UA を回避）
   *   - Asia/Tokyo タイムゾーン・日本語ロケール・Accept-Language 指定
   *   - navigator.webdriver を undefined に偽装（initScript）
   */
  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    const storageState = (await loadSession(this.platform)) as Parameters<
      Browser['newContext']
    >[0] extends infer T
      ? T extends { storageState?: infer S }
        ? S | null
        : null
      : null;

    this.context = await this.browser.newContext({
      // storageStateは型がJSON or pathなのでそのまま渡す
      ...(storageState ? { storageState: storageState as never } : {}),
      viewport: { width: 1280, height: 800 },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      },
    });
    this.context.setDefaultTimeout(30_000);

    // navigator.webdriver を消し、window.chrome を生やす（bot検出の簡易回避）
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // window.chrome が無いと bot と判定するサイト対策
      const w = window as unknown as { chrome?: unknown };
      if (!w.chrome) {
        w.chrome = { runtime: {} };
      }
    });

    this.page = await this.context.newPage();

    if (this.debug) {
      this.page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
    }
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }

  /**
   * ログイン済みかを判定するヘルパー（派生クラスが実装）
   */
  protected abstract isLoggedIn(): Promise<boolean>;

  /**
   * 実ログインを行う（派生クラスが実装）
   */
  protected abstract performLogin(): Promise<void>;

  /**
   * ログイン。セッションが生きていればスキップ、失敗時は clear して再試行
   */
  async ensureLoggedIn(): Promise<void> {
    if (!this.page) throw new Error('launch() を先に呼んでください');

    // 保存セッションがある場合は有効性チェック
    if (await this.isLoggedIn().catch(() => false)) {
      return;
    }

    // ダメなら clear して実ログイン
    await clearSession(this.platform);
    await this.performLogin();

    // 新セッション保存
    if (this.context) await saveSession(this.platform, this.context);
  }

  /**
   * 現在のページのスクリーンショットを Supabase Storage にアップロード
   * 戻り値: path（`scraper-errors/{platform}/{timestamp}.png`）、失敗時は undefined
   */
  async captureErrorScreenshot(step: string): Promise<string | undefined> {
    if (!this.page) return;
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${this.platform}/${ts}_${step}.png`;
      const buffer = await this.page.screenshot({ fullPage: true });

      const supabase = createServiceClient();
      await ensureBucket(supabase);
      const { error } = await supabase.storage
        .from(ERROR_BUCKET)
        .upload(fileName, buffer, { contentType: 'image/png', upsert: false });
      if (error) {
        console.warn(`screenshot upload failed: ${error.message}`);
        return;
      }
      return `${ERROR_BUCKET}/${fileName}`;
    } catch (e) {
      console.warn('screenshot capture failed', e);
    }
  }

  /**
   * リトライ付きでアクションを実行
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    opts: { step: string; attempts?: number; delayMs?: number } = { step: 'action' }
  ): Promise<T> {
    const attempts = opts.attempts ?? 2;
    const delay = opts.delayMs ?? 1000;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (this.debug) console.warn(`[retry ${i + 1}/${attempts}] ${opts.step}:`, e);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (lastErr instanceof ScraperError) throw lastErr;
    throw new Error(
      `withRetry failed at "${opts.step}": ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  }
}

async function ensureBucket(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === ERROR_BUCKET)) return;
  await supabase.storage.createBucket(ERROR_BUCKET, { public: false });
}
