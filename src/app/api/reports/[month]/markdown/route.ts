import { NextRequest, NextResponse } from 'next/server';
import { getMonthlyReport } from '@/lib/queries/monthly-report';
import { renderMonthlyMarkdown } from '@/lib/notion/markdown';
import { requireAuth } from '@/lib/auth/require';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ month: string }> }
) {
  const unauth = await requireAuth(request);
  if (unauth) return unauth;
  const { month } = await context.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'invalid month' }, { status: 400 });
  }
  const data = await getMonthlyReport(month);
  const md = renderMonthlyMarkdown(data);
  return new NextResponse(md, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
