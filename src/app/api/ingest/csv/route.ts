import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseCsv } from '@/lib/csv-parser';
import { ingestCsvRows } from '@/lib/ingestion/csv-ingest';
import { Platform } from '@/lib/types';
import { requireAuth } from '@/lib/auth/require';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PlatformSchema = z.enum(['dlsite', 'fanza']);
const PeriodSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .optional();

/**
 * POST /api/ingest/csv
 *
 * multipart/form-data で以下を受ける:
 *   - files: File[]（複数CSV）
 *   - platform: 'dlsite' | 'fanza'
 *   - mode: 'preview' | 'commit'
 *   - period: JSON '{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}'（DLsite必須、Fanzaはオプション）
 */
export async function POST(request: NextRequest) {
  const unauth = await requireAuth(request);
  if (unauth) return unauth;
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const platformRaw = formData.get('platform');
    const modeRaw = formData.get('mode') ?? 'preview';
    const periodRaw = formData.get('period');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 });
    }

    const platformParse = PlatformSchema.safeParse(platformRaw);
    if (!platformParse.success) {
      return NextResponse.json({ error: 'invalid platform' }, { status: 400 });
    }
    const platform: Platform = platformParse.data;

    let periodOverride: { from: string; to: string } | undefined;
    if (typeof periodRaw === 'string' && periodRaw.length > 0) {
      try {
        const parsed = PeriodSchema.safeParse(JSON.parse(periodRaw));
        if (parsed.success) periodOverride = parsed.data;
      } catch {
        return NextResponse.json({ error: 'invalid period JSON' }, { status: 400 });
      }
    }

    if (platform === 'dlsite' && !periodOverride) {
      return NextResponse.json(
        { error: 'DLsite CSV は period（from/to）の指定が必須です' },
        { status: 400 }
      );
    }

    // ファイルごとにパース
    const fileResults = [];
    let allRows = [] as Awaited<ReturnType<typeof parseCsv>>['rows'];
    let globalPeriodFrom = '';
    let globalPeriodTo = '';

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = parseCsv({
        buffer,
        filename: file.name,
        platform,
        periodOverride,
      });
      fileResults.push({
        filename: file.name,
        rows: result.rows.length,
        skipped: result.skipped,
        warnings: result.warnings,
        periodFrom: result.periodFrom,
        periodTo: result.periodTo,
      });
      allRows = allRows.concat(result.rows);
      // 最初のファイルの期間を採用（複数ファイル時は想定しないが、念のため最大範囲を保持）
      if (!globalPeriodFrom || result.periodFrom < globalPeriodFrom) {
        globalPeriodFrom = result.periodFrom;
      }
      if (!globalPeriodTo || result.periodTo > globalPeriodTo) {
        globalPeriodTo = result.periodTo;
      }
    }

    // モード: preview（DB書き込みなし）
    if (modeRaw === 'preview') {
      return NextResponse.json({
        mode: 'preview',
        files: fileResults,
        total_rows: allRows.length,
        period_from: globalPeriodFrom,
        period_to: globalPeriodTo,
        sample: allRows.slice(0, 5), // プレビュー用サンプル5件
      });
    }

    // モード: commit（DB書き込み）
    const ingestResult = await ingestCsvRows({
      platform,
      rows: allRows,
      periodFrom: globalPeriodFrom,
      periodTo: globalPeriodTo,
      source: 'csv-upload',
      runner: 'manual',
    });

    return NextResponse.json({
      mode: 'commit',
      files: fileResults,
      result: ingestResult,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
