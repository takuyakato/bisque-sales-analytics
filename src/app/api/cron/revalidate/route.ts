import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  for (const t of tags) revalidateTag(t, { expire: 0 });

  return NextResponse.json({
    ok: true,
    tags,
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
