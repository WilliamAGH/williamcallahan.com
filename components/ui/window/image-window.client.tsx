/**
 * ImageWindow Component
 *
 * A component that renders an image within a macOS-style window frame
 * with interactive controls (close, minimize, maximize).
 *
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react'; // Import useEffect and useCallback
import type { ComponentProps } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '../../../lib/utils';
import { WindowControls } from '../navigation/window-controls';
import { useWindowSize } from '../../../hooks/useWindowSize';

/**
 * Props for the ImageWindow component
 */
export interface ImageWindowProps extends Omit<ImageProps, 'className' | 'style'> {
  /** Optional className override for the main wrapper */
  wrapperClassName?: string;
  /** Alt text for the image (used as accessible title potentially) */
  alt: string; // Make alt text required for accessibility
  /** Control vertical spacing */
  noMargin?: boolean;
}

/**
 * A component that renders an image within a macOS-style window frame
 * with interactive controls (close, minimize, maximize).
 * @component
 * @param {ImageWindowProps} props - The component props
 * @returns {JSX.Element} An image wrapped in a window frame.
 */
export const ImageWindow = ({
  wrapperClassName,
  src,
  alt,
  width,
  height,
  sizes,
  priority,
  noMargin = false,
  ...props // Spread remaining ImageProps
}: ImageWindowProps): JSX.Element => {
  // Add state for interactive behavior
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  // Create ref for the main window container to check clicks against
  const windowRef = useRef<HTMLDivElement>(null); // Renamed from imageRef for consistency
  // Get window size to determine control size
  const windowSize = useWindowSize();

  // Determine the appropriate control size based on screen width
  const controlSize = windowSize.width && windowSize.width < 640 ? 'sm' :
                     (windowSize.width && windowSize.width > 1280 ? 'lg' : 'md');

  // Handler functions for window controls
  const handleClose = () => {
    setIsVisible(prev => !prev); // Toggle visibility
  };

  const handleMinimize = () => {
    setIsMinimized(prev => !prev);
    if (isMaximized) setIsMaximized(false); // Exit maximized mode if active
  };

  // Wrap in useCallback to prevent recreation on each render
  const handleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
    if (isMinimized) setIsMinimized(false); // Exit minimized mode if active
  }, [isMinimized]); // Add dependencies

  // Effect for handling Escape key and click outside when maximized
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMaximized) {
        handleMaximize(); // Close maximized view on Escape
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Check if maximized and the click is outside the windowRef element
      if (isMaximized && windowRef.current && !windowRef.current.contains(event.target as Node)) {
        handleMaximize(); // Close maximized view
      }
    };

    if (isMaximized) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside); // Use mousedown like Terminal/CodeBlock
    }

    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMaximized, handleMaximize]); // Dependencies

  // Return early if window is closed
  if (!isVisible) {
    return (
      <div className={cn("relative group mx-auto max-w-full", !noMargin && "my-6", wrapperClassName)}>
        <div className={cn(
          "flex items-center bg-[#1a2a35] border border-gray-700/50 rounded-lg cursor-pointer",
          "px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 md:py-1.5" // Reduced height
        )} style={{
          overflow: 'hidden',
          borderRadius: '8px'
        }} onClick={handleClose}>
          <WindowControls
            onClose={handleClose}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            size={controlSize}
          />
          {/* Optional: Add title or filename here if available */}
          <div className="ml-2 sm:ml-4 flex-shrink min-w-0 text-xs text-gray-400 truncate" title={alt}> {/* Allow shrinking */}
            {alt || 'Image'}
          </div>
        </div>
      </div>
    );
  }

  // Create wrapper classes based on state
  const outerWrapperClasses = cn(
    'not-prose', // Add not-prose to prevent inheriting typography margins
    'relative group mx-auto flex justify-center', // Center the component with flex
    'w-full max-w-full', // Ensure it doesn't exceed container width
    !noMargin && 'my-6', // Optional margin based on prop
    isMaximized && 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8',
    wrapperClassName // Allow external override
  );

  // Create container classes based on state
  const containerClasses = cn(
    'relative overflow-hidden max-w-full', // Add max-w-full to contain within parent
    'inline-flex flex-col', // Use inline-flex to hug content but not exceed parent width
    'box-border', // Ensure consistent box sizing
    'transform-gpu', // Use GPU for rendering to avoid subpixel issues
    'shadow-md', // Apply shadow consistently to the whole container
    isMaximized && 'w-auto max-w-[95vw] sm:max-w-5xl max-h-[90vh] sm:max-h-[80vh]' // Responsive maximized view
  );

  // Create content classes based on state
  const contentClasses = cn(
    'relative bg-gray-50 dark:bg-gray-800/60',
    'overflow-hidden max-w-full', // Ensure content is constrained
    'leading-[0]', // Remove any line height issues
    'border-x border-b border-gray-700/50 rounded-b-lg',
    'border-t-0', // Ensure no top border to avoid double borders with toolbar
    'text-[0px]', // Eliminate any font-based spacing
    isMinimized ? 'max-h-0 overflow-hidden border-none' : '',
    isMaximized && 'flex-1 overflow-auto'
  );

  const imageWrapperClasses = cn(
    'text-[0px]', // Eliminate any font spacing
    'leading-[0]', // Eliminate any line height spacing
    'box-content', // Ensure dimensions are preserved
    'block' // Block display ensures proper containment
  );

  const imageClasses = cn(
    'block max-w-full h-auto', // Ensure image is responsive and maintains aspect ratio
    'align-bottom', // Eliminate any potential gap at the bottom
    'select-none', // Prevent selection behavior
    isMinimized ? 'hidden' : '',
    isMaximized && 'object-contain w-auto' // Ensures image fits in modal (Removed max-h-[70vh])
  );

  return (
    <div className={outerWrapperClasses}>
      {/* Assign the ref to the main container div */}
      <div ref={windowRef} className={containerClasses} style={{
        transform: 'scale(1.001)', // Tiny scale enlargement to close subpixel gaps
        transformOrigin: 'top center',
        overflow: 'hidden', // Ensure content doesn't overflow rounded corners
        borderRadius: '8px', // Consistent border radius
      }}>
        {/* macOS style toolbar */}
        <div className={cn(
          "flex items-center bg-[#1a2a35] border border-gray-700/50",
          "px-3 py-1.5", // Consistent padding like CodeBlock, potentially simpler
          "rounded-t-lg", // Only round the top
          isMinimized && "rounded-b-lg border-b"
        )} style={{ borderBottomWidth: isMinimized ? '1px' : '0px' }}>
          <WindowControls
            onClose={handleClose}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            size={controlSize}
          />
          {/* Optional: Add title or filename here if available */}
          <div className="ml-2 sm:ml-4 text-xs text-gray-400 truncate" title={alt}>
            {alt || 'Image'}
          </div>
        </div>

        {/* Image container - only shown if not minimized */}
        {/* Removed ref={imageRef} as windowRef is now on the main container */}
        <div className={contentClasses} style={{ marginTop: '-1px' }}>
          <div className={imageWrapperClasses}>
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes={sizes || "(max-width: 640px) 100vw, (max-width: 1024px) 75vw, 50vw"}
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              className={imageClasses}
              style={{
                maxWidth: '100%',
                height: 'auto',
                margin: '0 auto', // Center the image
                display: 'block', // Remove any inline spacing
                verticalAlign: 'bottom', // Ensure bottom alignment
                objectFit: 'contain', // Ensure image fits correctly
                lineHeight: 0 // Remove line height spacing
              }}
              {...props} // Pass remaining props
            />
          </div>
        </div>
      </div>

      {/* The old click-outside div is removed; logic is handled by the useEffect */}
    </div>
  );
};

ImageWindow.displayName = 'ImageWindow';
