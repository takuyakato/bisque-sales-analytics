import { NextRequest, NextResponse } from 'next/server';
import { generateSnapshots } from '@/lib/snapshot/generate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (auth && cronSecret && auth !== `Bearer ${cronSecret}`) {
      // 認証失敗
    }
    const result = await generateSnapshots();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
