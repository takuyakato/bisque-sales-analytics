import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuth } from '@/lib/auth/require';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().nullable().optional(),
  brand: z.enum(['CAPURI', 'BerryFeel', 'BLsand', 'unknown']).optional(),
  genre: z.enum(['BL', 'TL', 'all-ages']).nullable().optional(),
  release_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  auto_created: z.boolean().optional(),
});

/**
 * PATCH /api/works/[id]
 * 作品マスタの更新
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const unauth = await requireAuth(request);
  if (unauth) return unauth;
  const { id } = await context.params;
  try {
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid payload', issues: parsed.error.issues }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('works')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ work: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'bad request' },
      { status: 400 }
    );
  }
}
