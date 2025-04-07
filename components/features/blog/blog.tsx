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
    if (isRegistered) { // Check isRegistered here
      console.log(`Blog Component Render (${BLOG_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]); // Dependency array includes isRegistered

  // --- Conditional Rendering based on useWindowState ---

  // Render nothing until ready to prevent hydration mismatch
  if (!isRegistered) { // Check isRegistered here
     // Optionally return a skeleton or null
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

  return (
    <div className={cn(
      // Default positioning: relative within the page flow
      "max-w-5xl mx-auto mt-8",
      // Override for maximized: fixed to viewport
      isMaximized && "fixed inset-0 z-[60] max-w-none m-0"
    )}>
      <div className={cn(
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
        // Apply flex column layout and full height only when maximized
        isMaximized
          ? "w-full h-full rounded-none shadow-none flex flex-col"
          : "rounded-lg shadow-lg"
      )}>
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0">
          <div className="flex items-center">
            <WindowControls
              onClose={closeWindow}
              onMinimize={minimizeWindow}
              onMaximize={maximizeWindow}
            />
            <h1 className="text-xl font-mono ml-4">~/blog</h1>
          </div>
        </div>

        {/* Content area: make it scrollable and take remaining height when maximized */}
        <div className={cn(
          "p-6",
          isMaximized ? "overflow-y-auto flex-grow" : ""
        )}>
          {/* Render BlogList directly with the passed posts */}
          {initialPosts && initialPosts.length > 0 ? (
             <BlogList posts={initialPosts} />
           ) : (
             <div className="text-center py-8 text-gray-600 dark:text-gray-400">
               <p>No blog posts found.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}