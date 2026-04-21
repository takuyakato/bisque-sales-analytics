import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuth } from '@/lib/auth/require';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  language: z.enum(['ja', 'en', 'zh-Hant', 'zh-Hans', 'ko', 'unknown']).optional(),
  origin_status: z.enum(['original', 'translation', 'unknown']).optional(),
  product_title: z.string().optional(),
});

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
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('product_variants')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variant: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'bad' }, { status: 400 });
  }
}
