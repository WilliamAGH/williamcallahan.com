/**
 * Background Info Component
 * @module components/ui/backgroundInfo
 * @description
 * Displays a stylized background information box in blog posts.
 * Used to highlight contextual information that's supplementary to the main content.
 */

'use client';

import { ReactNode, useState, useRef, useEffect } from 'react'; // Import useRef, useEffect
import { InfoIcon, ChevronDown, ChevronUp } from 'lucide-react'; // Import icons
import { cn } from '../../lib/utils';

interface BackgroundInfoProps {
  /** The content to display inside the box */
  children: ReactNode;
  /** Optional title for the background info box (defaults to "Background Info") */
  title?: string;
  /** Optional CSS class name for additional styling */
  className?: string;
  /** Optional icon to display (defaults to InfoIcon) */
  icon?: ReactNode;
}

/**
 * BackgroundInfo Component
 * @component
 * @param {BackgroundInfoProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export function BackgroundInfo({
  children,
  title = "Background Info",
  className = "",
  icon = <InfoIcon className="w-4 h-4" />
}: BackgroundInfoProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const [canOverflow, setCanOverflow] = useState(false); // State for potential overflow
  const contentRef = useRef<HTMLDivElement>(null); // Ref for content div

  // Restore original container classes, add mobile width override
  const containerClasses = cn(
    "mt-[-2px] mb-1 py-1 rounded-lg border", // Original vertical padding/margin
    "bg-blue-100 dark:bg-blue-900/20",
    "border-blue-200 dark:border-blue-800",
    // Apply negative horizontal margins ONLY below md breakpoint to counteract parent padding
    // Apply appropriate horizontal padding for mobile (px-4) and desktop (px-6)
    "max-md:-mx-4 px-4 md:px-6",
    className
  );

  // Effect to check if content *can* overflow and button is needed
  useEffect(() => {
    const checkCanOverflow = () => {
      if (contentRef.current && window.innerWidth < 768) {
        // Check if the scroll height exceeds the visible client height
        const needsButton = contentRef.current.scrollHeight > contentRef.current.clientHeight;
        setCanOverflow(needsButton);
      } else {
        // No button needed on desktop or if ref is not available
        setCanOverflow(false);
      }
    };

    // Check initially and on resize
    checkCanOverflow();
    // Use timeout to allow layout to settle after potential children changes
    const timeoutId = setTimeout(checkCanOverflow, 50);
    window.addEventListener('resize', checkCanOverflow);

    // Cleanup listener and timeout
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkCanOverflow);
    };
  }, [children]); // Re-check only when children change

  // Apply line clamp and overflow ONLY below md breakpoint AND when not expanded
  const contentClasses = cn(
    "prose-sm dark:prose-invert text-blue-800 dark:text-blue-200", // Original content classes
    // Remove conditional negative margin, rely on prose and title margin
    isExpanded ? '' : 'max-md:line-clamp-7 max-md:max-h-[12em] max-md:overflow-hidden'
  );

  // Restore original title container classes, reduce bottom margin
  const titleContainerClasses = cn(
    "flex items-baseline gap-1 mb-0 mt-[-12px]" // Reduced mb-4 to mb-1
  );

  const toggleButtonClasses = cn(
    "flex items-center justify-center w-full px-4 py-2 text-sm font-medium",
    "text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/30",
    "border-t border-blue-200 dark:border-blue-800",
    "transition-colors"
  );

  return (
    <div className={containerClasses}>
      {/* Original title structure */}
      <div className={titleContainerClasses}>
        <div className="text-blue-600 dark:text-blue-400 flex-shrink-0"> {/* Original icon container */}
          {icon}
        </div>
        <h4 className="font-medium text-lg text-blue-700 dark:text-blue-300">
          {title}
        </h4>
      </div>
      {/* Content div with conditional clamping and ref */}
      <div ref={contentRef} className={contentClasses}>
        {children}
      </div>
      {/* Button only shown below md breakpoint AND if content can overflow */}
      {canOverflow && (
        <div className="md:hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
          className={toggleButtonClasses}
          aria-expanded={isExpanded} // Use boolean directly
        >
          {isExpanded ? "Read less" : "Read more"}
            {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
