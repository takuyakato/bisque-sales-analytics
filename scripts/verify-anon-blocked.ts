import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const relations = [
  'sales_daily',
  'works',
  'product_variants',
  'sales_unified_daily',
  'daily_breakdown_summary',
  'monthly_platform_summary',
  'monthly_brand_summary',
  'monthly_language_summary',
  'monthly_brand_language_summary',
  'work_revenue_summary',
  'work_d30_summary',
  'ingestion_log',
] as const;

function loadEnvLocal(): void {
  try {
    const contents = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;

      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function getAnonKey(): string | undefined {
  const argument = process.argv.find((value) => value.startsWith('--anon-key='));
  return argument?.slice('--anon-key='.length) || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = getAnonKey();

if (!supabaseUrl || !anonKey) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL（または SUPABASE_URL）と anon key（.env.local または --anon-key）が必要です。'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  const readable: string[] = [];

  for (const relation of relations) {
    const { data, error } = await supabase.from(relation).select('*').limit(1);
    if (error || !data || data.length === 0) {
      console.log(`[blocked] ${relation}${error ? `: ${error.message}` : ': 0 rows'}`);
    } else {
      readable.push(relation);
      console.error(`[readable] ${relation}`);
    }
  }

  const rpcName = 'get_top_works_d30';
  const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, { top_n: 1 });
  if (rpcError || !rpcData || rpcData.length === 0) {
    console.log(`[blocked] ${rpcName}${rpcError ? `: ${rpcError.message}` : ': 0 rows'}`);
  } else {
    readable.push(rpcName);
    console.error(`[readable] ${rpcName}`);
  }

  if (readable.length > 0) {
    console.error(`anon から読み取り可能な対象: ${readable.join(', ')}`);
    process.exit(1);
  }

  console.log('全対象で anon アクセスが遮断されています。');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
