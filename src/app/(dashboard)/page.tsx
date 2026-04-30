import { Suspense } from 'react';
import { KpiSection } from './sections/KpiSection';
import { DailyChartSection } from './sections/DailyChartSection';
import { MonthlyChartSection } from './sections/MonthlyChartSection';
import { BreakdownSection } from './sections/BreakdownSection';
import { TopWorksSection } from './sections/TopWorksSection';
import {
  KpiSkeleton,
  ChartSkeleton,
  BreakdownSkeleton,
  TableSkeleton,
} from './sections/Skeletons';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection />
      </Suspense>

      <Suspense
        fallback={
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        }
      >
        <DailyChartSection />
      </Suspense>

      <Suspense
        fallback={
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        }
      >
        <MonthlyChartSection />
      </Suspense>

      <Suspense fallback={<BreakdownSkeleton />}>
        <BreakdownSection />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <TopWorksSection />
      </Suspense>
    </div>
  );
}
