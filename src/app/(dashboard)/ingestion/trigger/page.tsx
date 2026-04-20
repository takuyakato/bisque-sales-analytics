'use client';

import { useState } from 'react';

type Workflow =
  | 'scrape-dlsite-daily'
  | 'scrape-fanza-daily'
  | 'scrape-dlsite-backfill'
  | 'scrape-fanza-backfill'
  | 'smoke-test-scrapers';

interface RunOption {
  workflow: Workflow;
  label: string;
  description: string;
  inputs?: Array<{ name: string; label: string; placeholder?: string; default?: string }>;
}

const OPTIONS: RunOption[] = [
  {
    workflow: 'scrape-dlsite-daily',
    label: 'DLsite 日次再実行',
    description: '前日分を取得（通常は毎朝JST 05:00に自動実行）',
  },
  {
    workflow: 'scrape-fanza-daily',
    label: 'Fanza 日次再実行',
    description: '前日分を取得（通常は毎朝JST 05:15に自動実行）',
  },
  {
    workflow: 'scrape-dlsite-backfill',
    label: 'DLsite 過去分バックフィル',
    description: '指定期間を一括取得',
    inputs: [
      { name: 'from', label: '開始年月', placeholder: '2026-01', default: '' },
      { name: 'to', label: '終了年月', placeholder: '2026-04', default: '' },
      { name: 'unit', label: '粒度 (daily/monthly)', default: 'monthly' },
    ],
  },
  {
    workflow: 'scrape-fanza-backfill',
    label: 'Fanza 過去分バックフィル',
    description: '指定期間を一括取得',
    inputs: [
      { name: 'from', label: '開始年月', placeholder: '2026-01', default: '' },
      { name: 'to', label: '終了年月', placeholder: '2026-04', default: '' },
      { name: 'unit', label: '粒度 (daily/monthly)', default: 'monthly' },
    ],
  },
  {
    workflow: 'smoke-test-scrapers',
    label: 'スモークテスト（ログイン確認のみ）',
    description: 'DLsite / Fanza のいずれかでログインだけ試す',
    inputs: [
      { name: 'platform', label: 'platform', default: 'dlsite' },
    ],
  },
];

export default function TriggerPage() {
  const [selected, setSelected] = useState<RunOption | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function run() {
    if (!selected) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/ingestion/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: selected.workflow, inputs }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMessage(`❌ ${j.error ?? '失敗'}`);
      } else {
        setMessage('✅ GitHub Actions をトリガーしました。進捗はGitHubのActions画面で確認できます。');
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-900">
        手動実行には `GITHUB_REPO` と `GITHUB_TOKEN`（workflow:write権限付きPAT）の環境変数が必要です。未設定の場合は
        <a
          href="https://github.com/takuyakato/bisque-sales-analytics/actions"
          target="_blank"
          className="underline"
          rel="noreferrer"
        >
          GitHub Actions 画面
        </a>
        から直接「Run workflow」してください。
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {OPTIONS.map((o) => (
          <button
            key={o.workflow}
            onClick={() => {
              setSelected(o);
              setInputs(Object.fromEntries(o.inputs?.map((i) => [i.name, i.default ?? '']) ?? []));
              setMessage('');
            }}
            className={`text-left p-4 rounded-lg border transition ${
              selected?.workflow === o.workflow
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div className="font-semibold text-gray-800 text-sm">{o.label}</div>
            <div className="text-xs text-gray-500 mt-1">{o.description}</div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{selected.label} の実行</h2>

          {selected.inputs && selected.inputs.length > 0 && (
            <div className="space-y-2 mb-4">
              {selected.inputs.map((inp) => (
                <div key={inp.name}>
                  <label className="block text-xs text-gray-500 mb-1">{inp.label}</label>
                  <input
                    type="text"
                    value={inputs[inp.name] ?? ''}
                    placeholder={inp.placeholder}
                    onChange={(e) => setInputs({ ...inputs, [inp.name]: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={run}
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '実行中…' : '実行'}
          </button>

          {message && <p className="text-sm mt-3">{message}</p>}
        </div>
      )}
    </div>
  );
}
