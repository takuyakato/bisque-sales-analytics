'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Work {
  id: string;
  slug: string | null;
  title: string;
  brand: string;
  genre: string | null;
  release_date: string | null;
  auto_created: boolean;
  notes: string | null;
}

export function WorkEditor({ work }: { work: Work }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: work.title,
    slug: work.slug ?? '',
    brand: work.brand,
    genre: work.genre ?? '',
    release_date: work.release_date ?? '',
    notes: work.notes ?? '',
    auto_created: work.auto_created,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/works/${work.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          genre: form.genre || null,
          slug: form.slug || null,
          release_date: form.release_date || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? '保存失敗');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">{work.title}</h2>
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            編集
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">ID</dt>
            <dd className="font-mono">{work.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">slug</dt>
            <dd className="font-mono">{work.slug ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">ブランド</dt>
            <dd>{work.brand}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">ジャンル</dt>
            <dd>{work.genre ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">リリース日</dt>
            <dd>{work.release_date ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">状態</dt>
            <dd>
              {work.auto_created ? (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">auto</span>
              ) : (
                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">確認済</span>
              )}
            </dd>
          </div>
          {work.notes && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">メモ</dt>
              <dd className="whitespace-pre-wrap">{work.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h2 className="text-lg font-bold text-gray-800 mb-3">編集中</h2>
      <div className="space-y-3 text-sm">
        <Field label="タイトル">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="slug（人間可読名、例: capuri-001）">
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md font-mono"
          />
        </Field>
        <Field label="ブランド">
          <select
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
          >
            <option value="CAPURI">CAPURI</option>
            <option value="BerryFeel">BerryFeel</option>
            <option value="BLsand">BLsand</option>
            <option value="unknown">unknown</option>
          </select>
        </Field>
        <Field label="ジャンル">
          <select
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
          >
            <option value="">—</option>
            <option value="BL">BL</option>
            <option value="TL">TL</option>
            <option value="all-ages">all-ages</option>
          </select>
        </Field>
        <Field label="リリース日">
          <input
            type="date"
            value={form.release_date}
            onChange={(e) => setForm({ ...form, release_date: e.target.value })}
            className="px-3 py-1.5 border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="メモ">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
            rows={2}
          />
        </Field>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.auto_created}
            onChange={(e) => setForm({ ...form, auto_created: e.target.checked })}
          />
          <span className="text-sm">auto_created（外すと「確認済み」マーク）</span>
        </label>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            onClick={save}
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中…' : '保存'}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={loading}
            className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
