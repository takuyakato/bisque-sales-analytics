import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  ingestion_log_id: z.string().uuid(),
});

/**
 * POST /api/ingestion/rollback
 * 指定された ingestion_log_id に紐付く sales_daily 行を全削除、ingestion_log にもマーク
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }
    const { ingestion_log_id } = parsed.data;

    const supabase = createServiceClient();

    // 削除対象を数えてから削除
    const { count: targetCount } = await supabase
      .from('sales_daily')
      .select('*', { count: 'exact', head: true })
      .eq('ingestion_log_id', ingestion_log_id);

    const { error: delErr } = await supabase
      .from('sales_daily')
      .delete()
      .eq('ingestion_log_id', ingestion_log_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // ingestion_log にロールバック済みマーク
    await supabase
      .from('ingestion_log')
      .update({
        error_message: `rolled_back_at=${new Date().toISOString()}, deleted=${targetCount ?? 0}`,
        status: 'failed',
      })
      .eq('id', ingestion_log_id);

    return NextResponse.json({ ok: true, deleted: targetCount ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
