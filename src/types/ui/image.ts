/**
 * Image Component Types
 *
 * SCOPE: Types for image-related components, including logo images and proxies.
 */

export interface LogoImageProps {
  /** Logo source URL */
  src?: string;
  /** Logo alt text */
  alt: string;
  /** Logo width */
  width?: number;
  /** Logo height */
  height?: number;
  /** Custom CSS classes */
  className?: string;
  /** Whether to show fallback on error */
  showFallback?: boolean;
  /** Priority loading */
  priority?: boolean;
}

export interface OptimizedCardImageProps {
  src: string | null;
  alt: string;
  className?: string;
  /** Preload the image in the document head (Next.js 16+) */
  preload?: boolean;
  /** Base64 blur data URL for placeholder */
  blurDataURL?: string;
}

export interface ImgProxyProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** The original source URL of the image or a Blob */
  src?: string | Blob;
  /** Alt text for the image */
  alt?: string;
  /** Optional width for Next.js Image optimization */
  width?: number;
  /** Optional height for Next.js Image optimization */
  height?: number;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Display options for logo components
 * @usage - Controls how logos are rendered in UI components
 */
export interface LogoDisplayOptions {
  /** Invert logo colors for dark mode */
  shouldInvert?: boolean;
  /** Custom logo size */
  size?: number;
}
