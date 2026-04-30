'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';

export async function mergeWorksAction(
  mainId: string,
  dupIds: string[]
): Promise<{ ok: boolean; error?: string; movedVariants?: number; deletedWorks?: number }> {
  if (!mainId) return { ok: false, error: 'mainId required' };
  if (!Array.isArray(dupIds) || dupIds.length === 0) {
    return { ok: false, error: 'dupIds required' };
  }
  if (dupIds.includes(mainId)) {
    return { ok: false, error: 'main と dup が重複しています' };
  }

  const s = createServiceClient();

  // dups の variants を main に移動
  const { data: variants, error: e1 } = await s
    .from('product_variants')
    .update({ work_id: mainId })
    .in('work_id', dupIds)
    .select('id');
  if (e1) return { ok: false, error: `variants update: ${e1.message}` };
  const movedVariants = variants?.length ?? 0;

  // dups の works を削除
  const { data: deletedRows, error: e2 } = await s
    .from('works')
    .delete()
    .in('id', dupIds)
    .select('id');
  if (e2) return { ok: false, error: `works delete: ${e2.message}` };
  const deletedWorks = deletedRows?.length ?? 0;

  // キャッシュ破棄
  revalidatePath('/works');
  revalidateTag('sales-data', 'max');

  return { ok: true, movedVariants, deletedWorks };
}
