export function KpiSkeleton() {
  return (
    <>
      <div className="mb-6">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4">
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-3 w-40 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </>
  );
}

export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-3" />
      <div className={`${height} bg-gray-100 rounded animate-pulse`} />
    </div>
  );
}

export function BreakdownSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow p-5">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-3" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-full bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/**
 * セクション単位のエラー表示（データ取得失敗時の明示）
 * 0 表示にならず、ユーザーが「壊れている」と気付ける状態にする。
 */
export function ErrorMessage({ section, message }: { section: string; message?: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg shadow p-5 mb-6">
      <h2 className="text-sm font-semibold text-red-700 mb-2">
        ⚠️ {section} の取得に失敗しました
      </h2>
      <p className="text-xs text-red-600">
        データソースに問題がある可能性があります。少し待って再読み込みしても直らない場合は、Supabase の状態を確認してください。
      </p>
      {message && (
        <p className="text-xs text-red-500 mt-2 font-mono">{message}</p>
      )}
    </div>
  );
}
