/**
 * Skeleton loader component with stable keys for loading states
 * @returns {JSX.Element} Skeleton loading animation
 */
const BookmarkCardSkeleton = () => (
  <div className="p-4 border rounded-lg space-y-3 animate-pulse">
    <div className="flex items-center space-x-3">
      <div className="h-8 w-8 bg-gray-300 rounded-full" />
      <div className="h-4 w-1/3 bg-gray-300 rounded" />
    </div>
    <div className="h-5 w-3/4 bg-gray-300 rounded" />
    <div className="h-4 w-full bg-gray-300 rounded" />
    <div className="h-4 w-5/6 bg-gray-300 rounded" />
    <div className="flex space-x-2 pt-2">
      <div className="h-6 w-16 bg-gray-300 rounded-full" />
      <div className="h-6 w-20 bg-gray-300 rounded-full" />
    </div>
  </div>
);

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-1/4 bg-gray-300 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <BookmarkCardSkeleton key={`bookmark-skeleton-loading-${Date.now()}-${index}`} />
        ))}
      </div>
    </div>
  );
}
