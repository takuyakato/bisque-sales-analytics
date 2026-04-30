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

  // 1. 先に MATERIALIZED VIEW を REFRESH（キャッシュ破棄前に新値を準備）
  let mvRefreshed = false;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc('refresh_all_summaries');
    if (!error) mvRefreshed = true;
    else console.warn('MV refresh failed:', error.message);
  } catch (e) {
    console.warn('MV refresh error:', e instanceof Error ? e.message : e);
  }

  // 2. その後にキャッシュタグを破棄（次のアクセスから新MVが見える）
  for (const t of tags) revalidateTag(t, 'max');

  return NextResponse.json({ ok: true, tags, mvRefreshed, at: new Date().toISOString() });
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
