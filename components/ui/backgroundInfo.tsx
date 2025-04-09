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
  const contentRef = useRef<HTMLDivElement>(null); // Ref to measure content

  // Effect to check content height and determine if button is needed, includes resize handling
  useEffect(() => {
    // Function to check the content height against the threshold
    const checkHeight = () => {
      // Use timeout to ensure layout calculations are complete
      setTimeout(() => {
        if (contentRef.current) {
          const buffer = 16; // Buffer to prevent button showing for minimal overflow (adjust as needed)
          const collapsedHeightThreshold = 144; // Corresponds to max-h-36 (9rem * 16px/rem)

          // Check if the actual content height significantly exceeds the collapsed threshold
          const isContentSignificantlyTaller =
            contentRef.current.scrollHeight > (collapsedHeightThreshold + buffer);

          // Update state only if the visibility status needs to change
          // This prevents unnecessary re-renders
          setShowToggleButton(prev =>
            prev !== isContentSignificantlyTaller ? isContentSignificantlyTaller : prev
          );
        }
      }, 0); // 0ms delay helps push this check after the current render cycle
    };

    checkHeight(); // Perform initial check on mount or when children change

    // Add resize listener to re-evaluate height when window size changes
    window.addEventListener('resize', checkHeight);

    // Cleanup: remove the resize listener when the component unmounts
    return () => {
      window.removeEventListener('resize', checkHeight);
    };
    // Dependencies: This effect runs when the component mounts and whenever the `children` prop changes.
  }, [children]);

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

  // Define content classes with conditional max-height and transition for mobile
  const contentClasses = cn(
    "prose-sm dark:prose-invert text-blue-800 dark:text-blue-200", // Base styles
    "max-md:overflow-hidden transition-[max-height] duration-300 ease-in-out", // Mobile transition/overflow
    isExpanded ? "max-md:max-h-[1000px]" : "max-md:max-h-36" // Conditional mobile height
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
      {/* Content div with conditional max-height and ref */}
      <div ref={contentRef} className={contentClasses}>
        {children}
      </div>
      {/* Button container: Render only if needed (content taller than collapsed) AND below md breakpoint */}
      {showToggleButton && (
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
      {/* Removed conditional rendering based on isClampedInitially */}
    </div>
  );
}
