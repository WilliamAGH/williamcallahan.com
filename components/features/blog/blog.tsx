"use client"; // Make this a Client Component

/**
 * Blog Page Component - Client Wrapper
 */

import { useEffect, Suspense } from 'react'; // Import hooks (useState might not be needed)
import type { BlogPost as BlogPostType } from '@/types/blog'; // Import the type
import { BlogList } from './blog-list';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { useRegisteredWindowState } from "@/lib/context/GlobalWindowRegistryContext";
import { Newspaper } from 'lucide-react'; // Import specific icon
import { cn } from '@/lib/utils'; // Import cn utility

// Define a unique ID for this window instance
const BLOG_WINDOW_ID = 'blog-window';

// --- Server Components defined within the same file (can be rendered by Client Components) ---
function BlogSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
      ))}
    </div>
  );
}

// Define props for the Blog component
interface BlogProps {
  initialPosts: BlogPostType[];
}

export function Blog({ initialPosts }: BlogProps) {
  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(BLOG_WINDOW_ID, Newspaper, 'Restore Blog', 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) {
      console.log(`Blog Component Render (${BLOG_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]);

  // --- Conditional Rendering based on useWindowState ---

  // Render nothing until ready to prevent hydration mismatch
  if (!isRegistered) {
     return null;
  }

  // Handle closed state
  if (windowState === "closed") {
    console.log(`Blog Component (${BLOG_WINDOW_ID}): Rendering null (closed)`);
    return null;
  }

  // Handle minimized state
  if (windowState === "minimized") {
    console.log(`Blog Component (${BLOG_WINDOW_ID}): Rendering null (minimized)`);
    return null;
  }

  // Render normal or maximized view
  console.log(`Blog Component (${BLOG_WINDOW_ID}): Rendering ${windowState} view`);
  // Apply fixed positioning and sizing when maximized
  const isMaximized = windowState === 'maximized';

  // Refactored structure to match other clients (single main wrapper)
  return (
    <div className={cn(
      // Base styles
      "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
      "transition-all duration-300 ease-in-out",
      // Normal state styles
      "relative max-w-5xl mx-auto mt-8 rounded-lg shadow-lg",
      // Maximized state overrides
      isMaximized &&
        "fixed inset-0 z-[60] max-w-none m-0 rounded-none shadow-none flex flex-col h-full top-16 bottom-16 md:bottom-4"
    )}>
      {/* Sticky Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <WindowControls
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
          />
          <h1 className="text-xl font-mono ml-4">~/blog</h1>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className={cn(
        "p-6",
        isMaximized ? "overflow-y-auto flex-grow" : ""
      )}>
        {/* Render BlogList directly */}
        {initialPosts && initialPosts.length > 0 ? (
           <BlogList posts={initialPosts} />
         ) : (
           <div className="text-center py-8 text-gray-600 dark:text-gray-400">
             <p>No blog posts found.</p>
           </div>
         )}
      </div>
    </div>
  );
}