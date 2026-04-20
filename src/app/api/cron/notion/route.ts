import { NextRequest, NextResponse } from 'next/server';
import { syncMonthToNotion } from '@/lib/notion/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

function thisMonthJst(): string {
  // JST基準で現在月を YYYY-MM として返す
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * POST /api/cron/notion
 *   - Vercel Cron または手動実行で、指定月（or 当月）のNotionページを同期する
 *   - クエリパラメータ: ?month=YYYY-MM で対象月指定（なければ当月）
 *   - Authorization: Bearer $CRON_SECRET が必要（Cron時）
 *     もしくはクライアントから叩く時は Origin チェック（middleware 側）
 */
export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET が Authorization で来ている or middleware 経由の認証済みリクエスト
    const auth = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (auth && cronSecret && auth === `Bearer ${cronSecret}`) {
      // cron経由、OK
    }

    const url = new URL(request.url);
    const monthParam = url.searchParams.get('month');
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : thisMonthJst();

    const result = await syncMonthToNotion(month);
    return NextResponse.json({ ok: true, month, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Vercel Cron は GET を叩く設定もあるので GET も受ける
export async function GET(request: NextRequest) {
  return POST(request);
}
