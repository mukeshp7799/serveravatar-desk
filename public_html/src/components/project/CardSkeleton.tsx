/**
 * Loading skeleton for dashboard cards — same shape as ProjectDashboardCard
 * but uses placeholder bars instead of real content.
 */
export default function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 card-hover">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-5 w-12 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3 space-y-1.5">
        <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-2.5 w-1/3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-3 w-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
    </div>
  )
}