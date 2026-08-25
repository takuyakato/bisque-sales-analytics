import type { createServiceClient } from '@/lib/supabase/service';

type Supabase = ReturnType<typeof createServiceClient>;

/**
 * Supabase の 1000行デフォルト制限を超えて全行を取得する。
 * 金額の合計にはこの関数を使わない。DB 側 RPC を使う。
 * 順序は一意になる列の組を渡す。
 */
export async function fetchAllPages<T>(
  supabase: Supabase,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
  opts: {
    order: string[];
    uniqueKey?: string[];
    pageSize?: number;
    parallelism?: number;
  }
): Promise<T[]> {
  if (!opts?.order?.length) {
    throw new Error('fetchAllPages には一意な順序が必要です。金額集計は RPC を使うこと。');
  }
  const pageSize = opts.pageSize ?? 1000;
  const parallelism = opts.parallelism ?? 5;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordered = (query: any) => {
    let result = build(query);
    for (const column of opts.order) result = result.order(column, { ascending: true });
    return result;
  };

  const { count, error: countError } = await build(
    supabase.from(table).select('*', { count: 'exact', head: true })
  );
  if (countError) throw new Error(`${table} の件数取得に失敗しました: ${countError.message}`);
  if (count === null) throw new Error(`${table} の総件数を取得できませんでした`);

  const out: T[] = [];
  const pageCount = Math.ceil(count / pageSize);
  for (let firstPage = 0; firstPage < pageCount; firstPage += parallelism) {
    const batch: Promise<T[]>[] = [];
    for (let page = firstPage; page < Math.min(pageCount, firstPage + parallelism); page++) {
      const offset = page * pageSize;
      const q = ordered(supabase.from(table)).range(offset, offset + pageSize - 1);
      batch.push(
        q.then(({ data, error }: { data: T[] | null; error: unknown }) => {
          if (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${table} のページ取得に失敗しました: ${message}`);
          }
          if (!data) throw new Error(`${table} のページ取得結果が null です`);
          return data;
        })
      );
    }
    const results = await Promise.all(batch);
    for (const rows of results) out.push(...rows);
  }

  if (out.length !== count) {
    throw new Error(`${table} の取得件数が総件数と一致しません: expected=${count}, actual=${out.length}`);
  }
  if (opts.uniqueKey?.length) {
    const seen = new Set<string>();
    for (const row of out) {
      const record = row as Record<string, unknown>;
      const key = opts.uniqueKey.map((column) => String(record[column])).join('|');
      if (seen.has(key)) throw new Error(`${table} で重複キーを検出しました: ${key}`);
      seen.add(key);
    }
  }
  return out;
}
