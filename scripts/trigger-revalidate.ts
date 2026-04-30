import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

(async () => {
  const url = 'https://bisque-sales-analytics.vercel.app/api/cron/revalidate';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tags: ['sales-data'] }),
  });
  console.log(`status: ${res.status}`);
  console.log('body:', await res.text());
})();
