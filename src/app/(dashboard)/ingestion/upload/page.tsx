'use client';

import { useState } from 'react';
import { languageLabel } from '@/lib/utils/language-label';

type Platform = 'dlsite' | 'fanza';
type Mode = 'preview' | 'commit';

interface PreviewFile {
  filename: string;
  rows: number;
  skipped: number;
  warnings: string[];
  periodFrom: string;
  periodTo: string;
}

interface PreviewResponse {
  mode: 'preview';
  files: PreviewFile[];
  total_rows: number;
  period_from: string;
  period_to: string;
  sample: Array<{
    product_id: string;
    product_title: string;
    language: string;
    brand: string;
    sales_count: number;
    net_revenue_jpy: number;
  }>;
}

interface CommitResponse {
  mode: 'commit';
  files: PreviewFile[];
  result: {
    status: string;
    ingestion_log_id: string;
    inserted: number;
    updated: number;
    skipped: number;
    new_variants: number;
    new_works: number;
    error_message?: string;
  };
}

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [platform, setPlatform] = useState<Platform>('dlsite');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState('');

  async function submit(mode: Mode) {
    setLoading(true);
    setError('');
    if (mode === 'preview') {
      setPreview(null);
      setCommitResult(null);
    }

    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      formData.append('platform', platform);
      formData.append('mode', mode);

      if (periodFrom && periodTo) {
        formData.append('period', JSON.stringify({ from: periodFrom, to: periodTo }));
      }

      const res = await fetch('/api/ingest/csv', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '取込に失敗しました');
        return;
      }

      if (mode === 'preview') {
        setPreview(json as PreviewResponse);
      } else {
        setCommitResult(json as CommitResponse);
        setPreview(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">CSV取込</h1>
        <p className="text-sm text-gray-600 mb-6">
          DLsite または Fanza からダウンロードしたCSVをアップロードして取込みます。
        </p>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">プラットフォーム</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="dlsite">DLsite</option>
              <option value="fanza">Fanza</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              期間指定（DLsite必須、Fanzaは空ならファイル名から自動抽出）
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md flex-1"
                placeholder="From"
              />
              <span className="self-center">〜</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md flex-1"
                placeholder="To"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              期間が1日なら日次、2日以上なら月次集計として格納されます
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">CSVファイル（複数可）</label>
            <input
              type="file"
              accept=".csv"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="w-full"
            />
            {files.length > 0 && (
              <p className="text-xs text-gray-600 mt-1">{files.length}ファイル選択中</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => submit('preview')}
              disabled={loading || files.length === 0}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? '処理中…' : 'プレビュー'}
            </button>
            <button
              onClick={() => submit('commit')}
              disabled={loading || files.length === 0 || !preview}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '処理中…' : '確定取込'}
            </button>
          </div>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        </div>

        {preview && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3 text-gray-800">プレビュー結果</h2>
            <p className="text-sm text-gray-700 mb-2">
              <strong>期間</strong>: {preview.period_from} 〜 {preview.period_to}
            </p>
            <p className="text-sm text-gray-700 mb-3">
              <strong>取込対象</strong>: {preview.total_rows} 件（スキップ合計:{' '}
              {preview.files.reduce((a, f) => a + f.skipped, 0)}件）
            </p>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">ファイル</th>
                  <th className="border p-2">行数</th>
                  <th className="border p-2">スキップ</th>
                  <th className="border p-2 text-left">警告</th>
                </tr>
              </thead>
              <tbody>
                {preview.files.map((f) => (
                  <tr key={f.filename}>
                    <td className="border p-2">{f.filename}</td>
                    <td className="border p-2 text-center">{f.rows}</td>
                    <td className="border p-2 text-center">{f.skipped}</td>
                    <td className="border p-2 text-red-600">
                      {f.warnings.slice(0, 2).join(' / ')}
                      {f.warnings.length > 2 ? ` 他${f.warnings.length - 2}件` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {preview.sample.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mt-4 mb-2">サンプル（5件）</h3>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">商品ID</th>
                      <th className="border p-2 text-left">タイトル</th>
                      <th className="border p-2">言語</th>
                      <th className="border p-2">レーベル</th>
                      <th className="border p-2">販売数</th>
                      <th className="border p-2">売上(¥)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s, i) => (
                      <tr key={i}>
                        <td className="border p-2 font-mono">{s.product_id}</td>
                        <td className="border p-2 truncate max-w-xs" title={s.product_title}>
                          {s.product_title.length > 40
                            ? s.product_title.slice(0, 40) + '…'
                            : s.product_title}
                        </td>
                        <td className="border p-2 text-center">{languageLabel(s.language)}</td>
                        <td className="border p-2 text-center">{s.brand}</td>
                        <td className="border p-2 text-right">{s.sales_count}</td>
                        <td className="border p-2 text-right">{s.net_revenue_jpy.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {commitResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3 text-green-900">
              取込完了 ({commitResult.result.status})
            </h2>
            <ul className="text-sm text-green-800 space-y-1">
              <li>ingestion_log_id: {commitResult.result.ingestion_log_id}</li>
              <li>新規挿入: {commitResult.result.inserted}件</li>
              <li>更新: {commitResult.result.updated}件</li>
              <li>スキップ（エラー）: {commitResult.result.skipped}件</li>
              <li>新規SKU: {commitResult.result.new_variants}件</li>
              <li>新規作品(auto-created): {commitResult.result.new_works}件</li>
              {commitResult.result.error_message && (
                <li className="text-red-700">エラー: {commitResult.result.error_message}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
