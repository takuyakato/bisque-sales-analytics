'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RollbackButton({ logId }: { logId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!window.confirm(`この取込（${logId.slice(0, 8)}...）の sales_daily 行を削除しますか？`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ingestion/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingestion_log_id: logId }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(`失敗: ${j.error}`);
        return;
      }
      alert(`削除完了: ${j.deleted} 件`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
    >
      {loading ? '削除中…' : 'ロールバック'}
    </button>
  );
}
