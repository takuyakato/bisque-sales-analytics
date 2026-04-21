import { Client } from '@notionhq/client';
import { createServiceClient } from '@/lib/supabase/service';
import { getMonthlyReport, type MonthlyReportData } from '@/lib/queries/monthly-report';
import { languageLabel } from '@/lib/utils/language-label';

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}
function pct(p: number | null): string {
  if (p === null) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

function getNotion(): Client {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error('NOTION_API_TOKEN が設定されていません');
  return new Client({ auth: token });
}

function getParentPageId(): string {
  const id = process.env.NOTION_KPI_PARENT_PAGE_ID;
  if (!id) throw new Error('NOTION_KPI_PARENT_PAGE_ID が設定されていません');
  // URL から ID を抜き出す（32文字ハイフンなし or ハイフン有り両方対応）
  const m = id.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : id;
}

// Notion API の型（部分的）
type RichText = { type: 'text'; text: { content: string } };
type BlockCreate = Record<string, unknown>;

function richText(content: string): RichText[] {
  return [{ type: 'text', text: { content } }];
}

function heading(level: 1 | 2 | 3, text: string): BlockCreate {
  const key = `heading_${level}` as const;
  return { object: 'block', type: key, [key]: { rich_text: richText(text) } };
}

function paragraph(text: string): BlockCreate {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  };
}

function callout(text: string, emoji = '📊'): BlockCreate {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: richText(text),
      icon: { type: 'emoji', emoji },
    },
  };
}

function buildSummaryCallout(data: MonthlyReportData): BlockCreate {
  const s = data.summary;
  const lines = [
    `当月合計: ${fmt(s.totalJpy)}（${s.salesCount.toLocaleString()} 件）`,
    `前月比: ${pct(s.monthOverMonthPct)}（前月 ${fmt(s.prevMonthTotalJpy)}）`,
    `前年同月比: ${pct(s.yearOverYearPct)}（前年 ${fmt(s.prevYearSameMonthJpy)}）`,
  ];
  return callout(lines.join('\n'), '📊');
}

function buildBreakdownCallout(
  title: string,
  items: Array<{ label: string; revenue: number; salesCount: number }>
): BlockCreate {
  const total = items.reduce((a, r) => a + r.revenue, 0);
  const lines = items.map((r) => {
    const p = total ? ((r.revenue / total) * 100).toFixed(1) : '0.0';
    return `${r.label}: ${fmt(r.revenue)} (${p}%) / ${r.salesCount.toLocaleString()}件`;
  });
  return callout(`${title}\n` + lines.join('\n'), '📈');
}

function buildTableBlock(headers: string[], rows: string[][]): BlockCreate {
  const toRow = (cells: string[]): BlockCreate => ({
    object: 'block',
    type: 'table_row',
    table_row: { cells: cells.map((c) => richText(c)) },
  });
  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: headers.length,
      has_column_header: true,
      has_row_header: false,
      children: [toRow(headers), ...rows.map(toRow)],
    },
  };
}

function buildDailyTable(data: MonthlyReportData): BlockCreate {
  const rows = data.dailyTable.map((r) => [
    r.date,
    fmt(r.dlsite),
    fmt(r.fanza),
    fmt(r.youtube),
    fmt(r.total),
    pct(r.prevDayPct),
  ]);
  return buildTableBlock(['日付', 'DLsite', 'Fanza', 'YouTube', '合計', '前日比'], rows);
}

function buildTopWorksTable(data: MonthlyReportData): BlockCreate {
  const rows = data.topWorks.map((w, i) => [
    String(i + 1),
    w.slug ?? w.title.slice(0, 40),
    w.brand,
    fmt(w.revenue),
    w.salesCount.toLocaleString(),
  ]);
  return buildTableBlock(['#', '作品', 'レーベル', '売上', '販売数'], rows);
}

/**
 * 月次レポートをNotion ページに同期（初回はページ作成＋block_id保存、2回目以降はブロック更新）
 */
export async function syncMonthToNotion(month: string): Promise<{
  pageId: string;
  pageUrl: string | null;
  created: boolean;
}> {
  const notion = getNotion();
  const parentPageId = getParentPageId();
  const data = await getMonthlyReport(month);
  const supabase = createServiceClient();

  // 既存ページ確認
  const { data: existing } = await supabase
    .from('notion_pages')
    .select('*')
    .eq('month', month)
    .maybeSingle();

  if (!existing) {
    // 新規ページ作成
    return await createNewPage(notion, supabase, parentPageId, month, data);
  }

  // 既存ページ更新
  await updateExistingPage(notion, existing.page_id, data);

  await supabase
    .from('notion_pages')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('month', month);

  return { pageId: existing.page_id, pageUrl: existing.page_url, created: false };
}

async function createNewPage(
  notion: Client,
  supabase: ReturnType<typeof createServiceClient>,
  parentPageId: string,
  month: string,
  data: MonthlyReportData
): Promise<{ pageId: string; pageUrl: string | null; created: boolean }> {
  // ページ作成
  const pageResp = await notion.pages.create({
    parent: { type: 'page_id', page_id: parentPageId },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: `${month} KPIレポート` } }],
      },
    },
  });
  const pageId = pageResp.id;
  const pageUrl = 'url' in pageResp ? (pageResp.url as string) : null;

  // ブロックを追加
  const summaryBlock = buildSummaryCallout(data);
  const brandBlock = buildBreakdownCallout(
    'レーベル別',
    data.byBrand.map((r) => ({ label: r.brand, revenue: r.revenue, salesCount: r.salesCount }))
  );
  const langBlock = buildBreakdownCallout(
    '言語別',
    data.byLanguage.map((r) => ({ label: languageLabel(r.language), revenue: r.revenue, salesCount: r.salesCount }))
  );
  const dailyTable = buildDailyTable(data);
  const topWorksTable = buildTopWorksTable(data);

  const children: BlockCreate[] = [
    heading(1, `${month} 月次サマリ`),
    summaryBlock,
    heading(2, 'レーベル別'),
    brandBlock,
    heading(2, '言語別'),
    langBlock,
    heading(2, '作品トップ10'),
    topWorksTable,
    heading(2, '日次推移'),
    dailyTable,
  ];

  // 100件ずつバッチ挿入
  const chunkSize = 100;
  const insertedIds: { [key: string]: string } = {};

  for (let i = 0; i < children.length; i += chunkSize) {
    const batch = children.slice(i, i + chunkSize);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await notion.blocks.children.append({
      block_id: pageId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: batch as any,
    });
    // レスポンスからブロックIDを取得して追跡対象を記録
    // batchの中で summaryBlock/brandBlock 等がどのインデックスにあったかで判定
    for (let j = 0; j < batch.length; j++) {
      const globalIdx = i + j;
      const id = resp.results[j]?.id;
      if (!id) continue;
      if (children[globalIdx] === summaryBlock) insertedIds.summary = id;
      if (children[globalIdx] === brandBlock) insertedIds.brand = id;
      if (children[globalIdx] === langBlock) insertedIds.language = id;
      if (children[globalIdx] === topWorksTable) insertedIds.topWorks = id;
      if (children[globalIdx] === dailyTable) insertedIds.dailyTable = id;
    }
  }

  // notion_pages に記録
  await supabase.from('notion_pages').insert({
    month,
    page_id: pageId,
    page_url: pageUrl,
    summary_block_id: insertedIds.summary ?? null,
    daily_table_block_id: insertedIds.dailyTable ?? null,
    top_works_table_block_id: insertedIds.topWorks ?? null,
    language_summary_block_id: insertedIds.language ?? null,
    brand_summary_block_id: insertedIds.brand ?? null,
  });

  return { pageId, pageUrl, created: true };
}

async function updateExistingPage(
  notion: Client,
  pageId: string,
  data: MonthlyReportData
): Promise<void> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('notion_pages')
    .select('*')
    .eq('page_id', pageId)
    .maybeSingle();
  if (!row) return;

  // Callout 系は rich_text 書き換え
  if (row.summary_block_id) {
    await updateCallout(notion, row.summary_block_id, buildSummaryCallout(data));
  }
  if (row.brand_summary_block_id) {
    await updateCallout(
      notion,
      row.brand_summary_block_id,
      buildBreakdownCallout(
        'レーベル別',
        data.byBrand.map((r) => ({ label: r.brand, revenue: r.revenue, salesCount: r.salesCount }))
      )
    );
  }
  if (row.language_summary_block_id) {
    await updateCallout(
      notion,
      row.language_summary_block_id,
      buildBreakdownCallout(
        '言語別',
        data.byLanguage.map((r) => ({ label: languageLabel(r.language), revenue: r.revenue, salesCount: r.salesCount }))
      )
    );
  }

  // テーブル系は行を全削除→挿入
  if (row.top_works_table_block_id) {
    await replaceTableRows(notion, row.top_works_table_block_id, [
      ['#', '作品', 'レーベル', '売上', '販売数'],
      ...data.topWorks.map((w, i) => [
        String(i + 1),
        w.slug ?? w.title.slice(0, 40),
        w.brand,
        fmt(w.revenue),
        w.salesCount.toLocaleString(),
      ]),
    ]);
  }
  if (row.daily_table_block_id) {
    await replaceTableRows(notion, row.daily_table_block_id, [
      ['日付', 'DLsite', 'Fanza', 'YouTube', '合計', '前日比'],
      ...data.dailyTable.map((r) => [
        r.date,
        fmt(r.dlsite),
        fmt(r.fanza),
        fmt(r.youtube),
        fmt(r.total),
        pct(r.prevDayPct),
      ]),
    ]);
  }
}

async function updateCallout(notion: Client, blockId: string, built: BlockCreate): Promise<void> {
  // built は callout オブジェクトを持つ想定
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = { callout: (built as any).callout };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await notion.blocks.update({ block_id: blockId, ...body } as any);
  } catch (e) {
    console.warn('updateCallout failed:', e instanceof Error ? e.message : e);
  }
}

async function replaceTableRows(notion: Client, tableBlockId: string, rows: string[][]): Promise<void> {
  // 既存の table_row を全削除
  const existingChildren = await notion.blocks.children.list({ block_id: tableBlockId, page_size: 100 });
  for (const child of existingChildren.results) {
    await notion.blocks.delete({ block_id: child.id }).catch(() => {});
    await sleep(120);
  }
  // 新しい行を 100件ずつ appendchunkSize = 100
  const toRow = (cells: string[]): BlockCreate => ({
    object: 'block',
    type: 'table_row',
    table_row: { cells: cells.map((c) => richText(c)) },
  });
  const newRows = rows.map(toRow);
  for (let i = 0; i < newRows.length; i += 100) {
    const batch = newRows.slice(i, i + 100);
    await notion.blocks.children.append({
      block_id: tableBlockId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: batch as any,
    });
    await sleep(400);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
