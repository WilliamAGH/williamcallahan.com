/**
 * Mock for next/image
 *
 * Extracts Next.js-specific Image props to prevent React warnings about
 * non-standard attributes being passed to native <img> elements.
 */
import React from "react";

interface NextImageProps {
  src: string;
  alt: string;
  priority?: boolean;
  fill?: boolean;
  unoptimized?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
  onLoadingComplete?: unknown;
  [key: string]: unknown;
}

const NextImage = (props: NextImageProps): React.ReactElement => {
  const { src, alt, priority, fill, unoptimized, ...rest } = props;

  // Remove Next.js-specific props (not valid HTML attributes)
  delete rest.quality;
  delete rest.placeholder;
  delete rest.blurDataURL;
  delete rest.loader;
  delete rest.onLoadingComplete;

  return React.createElement("img", {
    src,
    alt,
    "data-testid": "next-image-mock",
    "data-priority": priority ? "true" : "false",
    "data-fill": fill ? "true" : "false",
    "data-unoptimized": unoptimized ? "true" : "false",
    ...rest,
  });
};

export default NextImage;
