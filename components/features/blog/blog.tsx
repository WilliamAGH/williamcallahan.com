"use client"; // Make this a Client Component

/**
 * Blog Page Component - Client Wrapper
 */

import { useEffect, useState, Suspense } from 'react'; // Import hooks
import { getAllPosts } from '@/lib/blog';
import { BlogList } from './blog-list';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { useWindowState, WindowState } from '@/lib/hooks/use-window-state'; // Import hook and type
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

async function BlogContent() {
  const posts = await getAllPosts();

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        <p>No blog posts found.</p>
      </div>
    );
  }

  return <BlogList posts={posts} />;
}

// --- Client Component Wrapper ---
export function Blog() {
  // Use the window state hook
  const {
    windowState,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    isReady // Use isReady for hydration safety (as returned by the hook)
  } = useWindowState(BLOG_WINDOW_ID, 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isReady) { // Check isReady here
      console.log(`Blog Component Render (${BLOG_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isReady]); // Dependency array includes isReady

  // --- Conditional Rendering based on useWindowState ---

  // Render nothing until ready to prevent hydration mismatch
  if (!isReady) { // Check isReady here
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
    console.log(`Blog Component (${BLOG_WINDOW_ID}): Rendering minimized view`);
    return (
      <div className="max-w-5xl mx-auto mt-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
            <div className="flex items-center">
              <WindowControls
                onClose={closeWindow}
                onMinimize={minimizeWindow}
                onMaximize={maximizeWindow} // Toggle maximize/restore
              />
              <h1 className="text-xl font-mono ml-4">~/blog (Minimized)</h1>
            </div>
          </div>
          {/* No content shown in minimized state */}
        </div>
      </div>
    );
  }

  // Render normal or maximized view
  console.log(`Blog Component (${BLOG_WINDOW_ID}): Rendering ${windowState} view`);
  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className={cn(
          "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
          // Add maximized styles if needed, e.g., affecting width/height
          // windowState === 'maximized' ? 'some-maximized-class' : ''
      )}>
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls
              onClose={closeWindow}
              onMinimize={minimizeWindow}
              onMaximize={maximizeWindow} // Toggle maximize/restore
            />
            <h1 className="text-xl font-mono ml-4">~/blog</h1>
          </div>
        </div>

        <div className="p-6">
          <Suspense fallback={<BlogSkeleton />}>
            <BlogContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}