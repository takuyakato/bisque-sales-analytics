'use client';

import { useState, useTransition } from 'react';
import { mergeWorksAction } from './actions';
import type { DuplicateGroup } from '@/lib/queries/duplicates';

const PLATFORM_LABEL: Record<string, string> = {
  dlsite: 'DLsite',
  fanza: 'Fanza',
  youtube: 'YouTube',
};

export function DuplicateCandidates({ groups }: { groups: DuplicateGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg shadow p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-amber-800">
          ⚠ 重複候補: {groups.length} グループ
        </h2>
        <p className="text-xs text-amber-700">
          同タイトル＋同ブランドで複数 works に分散しているケース。プラットフォーム構成を見て、同じ作品なら統合してください。
        </p>
      </div>
      <div className="space-y-3">
        {groups.map((g, i) => (
          <DuplicateGroupCard key={`${g.brand}-${i}`} group={g} />
        ))}
      </div>
    </div>
  );
}

function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const [selectedDups, setSelectedDups] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const main = group.members[0];

  const toggleDup = (id: string, checked: boolean) => {
    const s = new Set(selectedDups);
    if (checked) s.add(id);
    else s.delete(id);
    setSelectedDups(s);
  };

  const handleMerge = () => {
    if (selectedDups.size === 0) return;
    if (
      !confirm(
        `「${main.title.slice(0, 30)}...」のメイン work (${main.work_id}) に、選択した ${selectedDups.size} 件を統合します。\n\n変更内容:\n- 選択 works の variants がメインに移動\n- 選択 works が削除されます\n\n続行しますか？`
      )
    )
      return;
    startTransition(async () => {
      const res = await mergeWorksAction(main.work_id, Array.from(selectedDups));
      if (res.ok) {
        setResult(`✓ 統合完了 (${res.movedVariants} variants 移動 / ${res.deletedWorks} works 削除)`);
        setDone(true);
      } else {
        setResult(`✗ 失敗: ${res.error}`);
      }
    });
  };

  return (
    <div
      className={`bg-white rounded-md border p-3 ${
        done ? 'border-green-300 opacity-60' : 'border-amber-100'
      }`}
    >
      <div className="font-semibold text-sm text-gray-800 mb-2">
        [{group.brand}] {main.title}
      </div>
      <div className="space-y-1.5 text-xs">
        {group.members.map((m, idx) => {
          const isMain = idx === 0;
          const platforms = [...new Set(m.variants.map((v) => v.platform))]
            .map((p) => PLATFORM_LABEL[p] ?? p)
            .join('/');
          return (
            <div key={m.work_id} className="flex items-center gap-3">
              <span className="w-12">
                {isMain ? (
                  <span className="text-blue-600 font-bold">メイン</span>
                ) : (
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={pending || done}
                      checked={selectedDups.has(m.work_id)}
                      onChange={(e) => toggleDup(m.work_id, e.target.checked)}
                    />
                    <span>統合</span>
                  </label>
                )}
              </span>
              <span className="font-mono text-gray-500 min-w-[10ch]">{m.work_id}</span>
              <span className="text-gray-700 min-w-[12ch]">[{platforms || 'なし'}]</span>
              <span className="text-gray-600 min-w-[12ch] text-right">
                ¥{m.totalRevenue.toLocaleString()}
              </span>
              <span className="text-gray-500 text-[11px] truncate flex-1">
                {m.variants
                  .map((v) => `${PLATFORM_LABEL[v.platform] ?? v.platform}:${v.language}/${v.product_id}`)
                  .join(', ')}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleMerge}
          disabled={pending || done || selectedDups.size === 0}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:bg-gray-300"
        >
          {pending ? '実行中...' : `選択した ${selectedDups.size} 件をメインに統合`}
        </button>
        {result && <span className="text-xs">{result}</span>}
      </div>
    </div>
  );
}
