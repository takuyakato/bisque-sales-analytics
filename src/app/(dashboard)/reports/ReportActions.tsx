'use client';

import { useState } from 'react';

export function ReportActions({ month }: { month: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function copyMarkdown() {
    setLoading('md');
    setMessage('');
    try {
      const res = await fetch(`/api/reports/${month}/markdown`);
      if (!res.ok) throw new Error('取得失敗');
      const md = await res.text();
      await navigator.clipboard.writeText(md);
      setMessage('✅ Markdown をクリップボードにコピーしました');
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(null);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function downloadCsv() {
    setLoading('csv');
    setMessage('');
    try {
      window.location.href = `/api/reports/${month}/csv`;
      setTimeout(() => setMessage('✅ CSV ダウンロード開始'), 500);
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(null);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function syncNotion() {
    setLoading('notion');
    setMessage('');
    try {
      const res = await fetch(`/api/cron/notion?month=${month}`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'sync失敗');
      setMessage(`✅ Notion 同期完了（${j.pageUrl ?? j.pageId ?? ''}）`);
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(null);
      setTimeout(() => setMessage(''), 8000);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-700 mr-2">エクスポート:</span>
        <button
          onClick={copyMarkdown}
          disabled={loading !== null}
          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          {loading === 'md' ? '…' : 'Markdownをコピー'}
        </button>
        <button
          onClick={downloadCsv}
          disabled={loading !== null}
          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          {loading === 'csv' ? '…' : 'CSVダウンロード'}
        </button>
        <button
          onClick={syncNotion}
          disabled={loading !== null}
          className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50"
        >
          {loading === 'notion' ? '…' : 'Notion同期を今すぐ実行'}
        </button>

        {message && <span className="text-xs text-gray-600 ml-2">{message}</span>}
      </div>
    </div>
  );
}
