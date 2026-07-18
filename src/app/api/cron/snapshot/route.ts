import { NextRequest, NextResponse } from 'next/server';
import { generateSnapshots } from '@/lib/snapshot/generate';
import { hasValidCronBearer } from '@/lib/auth/cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!hasValidCronBearer(request)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
