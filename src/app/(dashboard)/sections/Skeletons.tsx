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
