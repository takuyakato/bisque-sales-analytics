import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

/**
 * キャッシュ破棄エンドポイント
 *
 * GitHub Actions（DLsite/Fanza/YouTube 取込）の末尾で呼ばれる
 * 認証: Bearer CRON_SECRET
 *
 * 例:
 *   curl -X POST https://.../api/cron/revalidate \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"tags":["sales-data"]}'
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let tags: string[] = ['sales-data'];
  try {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.tags)) tags = body.tags;
  } catch {
    // ボディ無し → デフォルト
  }

  // 1. 先に MATERIALIZED VIEW を個別 RPC で順次 REFRESH
  //    一括 refresh_all_summaries() でも動くが、1 個失敗しても他は続行できるよう個別に呼ぶ
  const REFRESH_FUNCTIONS = [
    'refresh_monthly_platform_summary',
    'refresh_monthly_brand_summary',
    'refresh_monthly_language_summary',
    'refresh_monthly_brand_language_summary',
    'refresh_daily_breakdown_summary',
    'refresh_work_d30_summary',
    'refresh_work_revenue_summary',
  ];
  const supabase = createServiceClient();
  const mvDetails: Record<string, boolean> = {};
  for (const fn of REFRESH_FUNCTIONS) {
    try {
      const { error } = await supabase.rpc(fn);
      mvDetails[fn] = !error;
      if (error) console.warn(`MV ${fn} failed:`, error.message);
    } catch (e) {
      mvDetails[fn] = false;
      console.warn(`MV ${fn} error:`, e instanceof Error ? e.message : e);
    }
  }
  const mvRefreshed = Object.values(mvDetails).every(Boolean);

  // 2. その後にキャッシュタグを破棄（次のアクセスから新MVが見える）
  for (const t of tags) revalidateTag(t, 'max');

  return NextResponse.json({
    ok: true,
    tags,
    mvRefreshed,
    mvDetails,
    at: new Date().toISOString(),
  });
}

/** 手動テスト用 GET（動作確認のみ、タグは破棄しない） */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ping: 'revalidate endpoint alive' });
}
