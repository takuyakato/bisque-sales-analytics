import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuth } from '@/lib/auth/require';

export const runtime = 'nodejs';

const BodySchema = z.object({
  target: z.string().nullable(), // works.id / slug / null
});

/**
 * POST /api/variants/[id]/link
 * variantの紐付け先workを変更する（id または slug で指定可能）
 * target = null で紐付け解除
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const unauth = await requireAuth(request);
  if (unauth) return unauth;
  const { id } = await context.params;
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 現在のvariantを取得（旧work_idを把握）
    const { data: currentVariant } = await supabase
      .from('product_variants')
      .select('work_id, product_id, platform')
      .eq('id', id)
      .single();

    if (!currentVariant) {
      return NextResponse.json({ error: 'variant not found' }, { status: 404 });
    }

    let newWorkId: string | null = null;

    if (parsed.data.target) {
      // id / slug で works を探す
      const { data: byId } = await supabase
        .from('works')
        .select('id')
        .eq('id', parsed.data.target)
        .maybeSingle();

      if (byId) {
        newWorkId = byId.id;
      } else {
        const { data: bySlug } = await supabase
          .from('works')
          .select('id')
          .eq('slug', parsed.data.target)
          .maybeSingle();
        if (bySlug) newWorkId = bySlug.id;
      }

      if (!newWorkId) {
        return NextResponse.json(
          { error: `works not found (id/slug="${parsed.data.target}")` },
          { status: 404 }
        );
      }
    }

    // variant の work_id を更新
    const { error: updErr } = await supabase
      .from('product_variants')
      .update({ work_id: newWorkId })
      .eq('id', id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // sales_daily の work_id は Phase 2 で DROP 済み、ここでの更新は不要

    // 旧 work が arphan（他に variant が紐付いておらず、かつ auto_created）なら削除
    const oldWorkId = currentVariant.work_id;
    if (oldWorkId && oldWorkId !== newWorkId) {
      const { count } = await supabase
        .from('product_variants')
        .select('*', { count: 'exact', head: true })
        .eq('work_id', oldWorkId);

      const { data: oldWork } = await supabase
        .from('works')
        .select('auto_created')
        .eq('id', oldWorkId)
        .single();

      if (count === 0 && oldWork?.auto_created) {
        await supabase.from('works').delete().eq('id', oldWorkId);
      }
    }

    return NextResponse.json({ ok: true, work_id: newWorkId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'bad' }, { status: 400 });
  }
}
