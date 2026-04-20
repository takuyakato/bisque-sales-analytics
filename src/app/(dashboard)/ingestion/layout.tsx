import { IngestionTabs } from '@/components/ingestion/IngestionTabs';

export default function IngestionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">取込管理</h1>
      </div>
      <IngestionTabs />
      <div>{children}</div>
    </div>
  );
}
