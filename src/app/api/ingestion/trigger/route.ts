import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require';

export const runtime = 'nodejs';

const BodySchema = z.object({
  workflow: z.enum([
    'scrape-dlsite-daily',
    'scrape-fanza-daily',
    'scrape-dlsite-backfill',
    'scrape-fanza-backfill',
    'smoke-test-scrapers',
  ]),
  inputs: z.record(z.string(), z.string()).optional(),
});

/**
 * POST /api/ingestion/trigger
 * GitHub Actions workflow_dispatch を経由して、指定のワークフローを起動
 *
 * 要環境変数: GITHUB_REPO=owner/repo, GITHUB_TOKEN=PAT（workflow:write権限）
 */
export async function POST(request: NextRequest) {
  const unauth = await requireAuth(request);
  if (unauth) return unauth;
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      return NextResponse.json(
        { error: 'GITHUB_REPO / GITHUB_TOKEN が設定されていません（Phase 1iで設定予定）' },
        { status: 503 }
      );
    }

    const url = `https://api.github.com/repos/${repo}/actions/workflows/${parsed.data.workflow}.yml/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: parsed.data.inputs ?? {},
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `GitHub API ${res.status}: ${text}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, workflow: parsed.data.workflow });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
