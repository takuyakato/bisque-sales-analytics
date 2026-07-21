import { existsSync, readFileSync } from 'fs';
import { createServiceClient } from '../src/lib/supabase/service';

const RPC_FUNCTIONS = [
  'refresh_monthly_platform_summary',
  'refresh_monthly_brand_summary',
  'refresh_monthly_language_summary',
  'refresh_monthly_brand_language_summary',
  'refresh_daily_breakdown_summary',
  'refresh_work_d30_summary',
  'refresh_work_revenue_summary',
] as const;

const MAX_ATTEMPTS = 3;

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の両方を設定してください。',
  );
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const supabase = createServiceClient();
  const totalStartedAt = Date.now();
  let succeeded = 0;
  let failed = 0;

  for (const mv of RPC_FUNCTIONS) {
    const startedAt = Date.now();
    let attempts = 0;
    let lastError: string | null = null;

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const { error } = await supabase.rpc(mv);
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error.message;
      } catch (error) {
        lastError = errorMessage(error);
      }

      if (attempts < MAX_ATTEMPTS) {
        await sleep(1_000 * 2 ** (attempts - 1));
      }
    }

    const ok = lastError === null;
    if (ok) succeeded += 1;
    else failed += 1;

    console.log(
      JSON.stringify({
        mv,
        ms: Date.now() - startedAt,
        ok,
        attempts,
        error: lastError,
      }),
    );
  }

  console.log(
    JSON.stringify({
      summary: true,
      succeeded,
      failed,
      ms: Date.now() - totalStartedAt,
    }),
  );

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
