import { Platform, ParseResult } from '@/lib/types';
import { decodeCP932 } from './decode';
import { parseDlsiteCsv } from './dlsite';
import { parseFanzaCsv } from './fanza';
import { extractFanzaPeriodFromFilename } from './period';

export interface ParseInput {
  /** 生のCSVバイナリ（CP932想定） */
  buffer: Buffer | Uint8Array;
  /** ファイル名（期間自動抽出に使う） */
  filename: string;
  /** 対象プラットフォーム */
  platform: Platform;
  /** UIで手動指定された期間（DLsiteは必須、Fanzaはオプション） */
  periodOverride?: { from: string; to: string };
}

/**
 * プラットフォームを問わずCSVをパースして、標準化された行を返す
 */
export function parseCsv(input: ParseInput): ParseResult {
  const text = decodeCP932(input.buffer);

  if (input.platform === 'dlsite') {
    if (!input.periodOverride) {
      throw new Error('DLsite CSV は期間指定が必須です（periodOverride を指定してください）');
    }
    return parseDlsiteCsv(text, input.periodOverride);
  }

  if (input.platform === 'fanza') {
    // オーバーライドが無ければファイル名から自動抽出を試みる
    const override =
      input.periodOverride ?? extractFanzaPeriodFromFilename(input.filename) ?? undefined;
    return parseFanzaCsv(text, override);
  }

  throw new Error(`未対応のプラットフォーム: ${input.platform}`);
}

export { decodeCP932 } from './decode';
export { parseDlsiteCsv } from './dlsite';
export { parseFanzaCsv } from './fanza';
export { extractFanzaPeriodFromFilename, normalizeDate, resolveAggregation } from './period';
