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
  pageSize = 1000,
  parallelism = 5
): Promise<T[]> {
  // 1ページ目の結果を見て、以降をparallel取得
  const firstQ = build(supabase.from(table)).range(0, pageSize - 1);
  const { data: firstData, error: firstErr } = await firstQ;
  if (firstErr || !firstData) return [];
  if (firstData.length < pageSize) return firstData as T[];

  const out: T[] = [...(firstData as T[])];
  let nextOffset = pageSize;
  let done = false;

  while (!done) {
    const batch: Promise<T[]>[] = [];
    for (let i = 0; i < parallelism; i++) {
      const offset = nextOffset + i * pageSize;
      const q = build(supabase.from(table)).range(offset, offset + pageSize - 1);
      batch.push(
        q.then(({ data, error }: { data: T[] | null; error: unknown }) => {
          if (error || !data) return [] as T[];
          return data;
        })
      );
    }
    const results = await Promise.all(batch);
    for (const rows of results) {
      out.push(...rows);
      if (rows.length < pageSize) done = true;
    }
    nextOffset += pageSize * parallelism;
  }
  return out;
}
