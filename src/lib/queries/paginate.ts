import type { createServiceClient } from '@/lib/supabase/service';

type Supabase = ReturnType<typeof createServiceClient>;

/**
 * Supabase の 1000行デフォルト制限を超えて全行を取得する。
 * 使い方:
 *   const rows = await fetchAllPages<T>(supabase, 'table', (q) =>
 *     q.select('a, b').gte('x', y)
 *   );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllPages<T>(
  supabase: Supabase,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const q = build(supabase.from(table)).range(offset, offset + pageSize - 1);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return out;
}
