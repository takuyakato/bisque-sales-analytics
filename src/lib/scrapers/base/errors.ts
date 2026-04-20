/**
 * スクレイパー共通のエラー型（v3.6 §5-2 準拠）
 * 構造化エラーで失敗原因を分類
 */

export type ScraperErrorKind =
  | 'auth'
  | 'selector-not-found'
  | 'timeout'
  | 'network'
  | 'parse'
  | 'unknown';

export class ScraperError extends Error {
  kind: ScraperErrorKind;
  step?: string;
  selector?: string;

  constructor(kind: ScraperErrorKind, message: string, opts?: { step?: string; selector?: string }) {
    super(message);
    this.name = 'ScraperError';
    this.kind = kind;
    this.step = opts?.step;
    this.selector = opts?.selector;
  }
}

export class AuthError extends ScraperError {
  constructor(message: string, opts?: { step?: string }) {
    super('auth', message, opts);
    this.name = 'AuthError';
  }
}

export class SelectorNotFoundError extends ScraperError {
  constructor(selector: string, step: string) {
    super('selector-not-found', `Selector not found: ${selector} at step "${step}"`, { step, selector });
    this.name = 'SelectorNotFoundError';
  }
}

export class TimeoutError extends ScraperError {
  constructor(step: string, timeoutMs: number) {
    super('timeout', `Timeout at step "${step}" (${timeoutMs}ms)`, { step });
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends ScraperError {
  constructor(message: string, opts?: { step?: string }) {
    super('network', message, opts);
    this.name = 'NetworkError';
  }
}
