'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { languageLabel } from '@/lib/utils/language-label';

interface Props {
  variantId: string;
  field: 'language' | 'origin_status' | 'work_link';
  value: string;
  options: string[];
}

function displayFor(field: 'language' | 'origin_status' | 'work_link', code: string): string {
  if (field === 'language') return languageLabel(code);
  return code;
}

export function VariantEditor({ variantId, field, value, options }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [loading, setLoading] = useState(false);

  if (field === 'work_link') {
    return <LinkWorkButton variantId={variantId} router={router} />;
  }

  async function save(newValue: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newValue }),
      });
      if (res.ok) {
        setCurrent(newValue);
        setEditing(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
      >
        {displayFor(field, current)}
      </button>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => save(e.target.value)}
      onBlur={() => setEditing(false)}
      autoFocus
      disabled={loading}
      className="text-xs px-1.5 py-0.5 border border-gray-300 rounded"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {displayFor(field, o)}
        </option>
      ))}
    </select>
  );
}

function LinkWorkButton({ variantId, router }: { variantId: string; router: ReturnType<typeof useRouter> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    const targetWorkId = window.prompt('紐付ける works.id または slug を入力（空でキャンセル、"null" で紐付け解除）');
    if (!targetWorkId) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/variants/${variantId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetWorkId === 'null' ? null : targetWorkId }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? '失敗');
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
      >
        紐付け変更
      </button>
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}
