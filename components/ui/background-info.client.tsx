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
  const [showToggleButton, setShowToggleButton] = useState(false); // State for button visibility
  const [isMounted, setIsMounted] = useState(false); // Track mount status
  const contentRef = useRef<HTMLDivElement>(null); // Ref to measure content

  // --- Effect 1: Set mounted status ---
  useEffect(() => {
    setIsMounted(true);
  }, []); // Runs once after initial client render

  // --- Effect 2: Check height AFTER mounting ---
  useEffect(() => {
    // Only proceed if mounted
    if (!isMounted) {
      return;
    }

    const checkHeight = () => {
      // setTimeout helps ensure layout is stable after potential shifts
      setTimeout(() => {
        if (contentRef.current) {
          const buffer = 16;
          const collapsedHeightThreshold = 144; // max-h-36
          const isContentSignificantlyTaller =
            contentRef.current.scrollHeight > (collapsedHeightThreshold + buffer);
          // Use functional update to avoid stale state issues
          setShowToggleButton(currentValue =>
             currentValue !== isContentSignificantlyTaller ? isContentSignificantlyTaller : currentValue
          );
        }
      }, 0);
    };

    checkHeight(); // Check initially after mount
    window.addEventListener('resize', checkHeight);
    return () => window.removeEventListener('resize', checkHeight);

  }, [isMounted, children]); // Rerun if children change AFTER mounting

  // --- Base Styles --- (Applied always)
  const containerClasses = cn(
    "mt-[-2px] mb-1 py-1 rounded-lg border",
    "bg-blue-100 dark:bg-blue-900/20",
    "border-blue-200 dark:border-blue-800",
    "max-md:-mx-4 px-4 md:px-6",
    className
  );
  const titleContainerClasses = cn(
    "flex items-baseline gap-1 mb-0 mt-[-12px]"
  );
  const toggleButtonClasses = cn(
    "flex items-center justify-center w-full px-4 py-2 text-sm font-medium",
    "text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/30",
    "border-t border-blue-200 dark:border-blue-800",
    "transition-colors"
  );

  // --- Dynamic Content Styles --- (Applied only AFTER mount)
  const dynamicContentClasses = isMounted
    ? cn(
        "max-md:overflow-hidden transition-[max-height] duration-300 ease-in-out",
        isExpanded ? "max-md:max-h-[1000px]" : "max-md:max-h-36"
      )
    : ""; // No dynamic styles before mount

  // --- Final Content Classes ---
  const contentClasses = cn(
    "prose-sm dark:prose-invert text-blue-800 dark:text-blue-200", // Base prose styles
    dynamicContentClasses // Add dynamic styles only post-mount
  );

  return (
    <div className={containerClasses}>
      <div className={titleContainerClasses}>
        <div className="text-blue-600 dark:text-blue-400 flex-shrink-0">
          {icon}
        </div>
        <h4 className="font-medium text-lg text-blue-700 dark:text-blue-300">
          {title}
        </h4>
      </div>

      {/* Content: suppressHydrationWarning might still be helpful as a fallback */}
      <div ref={contentRef} className={contentClasses} suppressHydrationWarning={true}>
        {children}
      </div>

      {/* Button: Render only AFTER mount AND if needed */}
      {isMounted && showToggleButton && (
        <div className="md:hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={toggleButtonClasses}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "Read less" : "Read more"}
              {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
            </button>
          </div>
      )}
    </div>
  );
}
