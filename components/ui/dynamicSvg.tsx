'use client';

import { memo } from 'react';

interface DynamicSVGProps {
  content: string;
  width?: string | number;
  height?: string | number;
  className?: string;
}

/**
 * Dynamic SVG Component
 *
 * Renders SVG content with proper MIME type handling and hydration support.
 * Used for dynamically loaded SVGs in MDX content.
 */
const DynamicSVG = memo(function DynamicSVG({
  content,
  width = 24,
  height = 24,
  className
}: DynamicSVGProps) {
  // Ensure SVG has proper namespace
  const processedContent = content.includes('xmlns=')
    ? content
    : content.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');

  // Add width/height if not present
  const finalContent = processedContent
    .replace(
      /<svg([^>]*)>/,
      (match, attrs) => {
        const hasWidth = attrs.includes('width=');
        const hasHeight = attrs.includes('height=');
        const hasViewBox = attrs.includes('viewBox=');

        let newAttrs = attrs;
        if (!hasWidth) newAttrs += ` width="${width}"`;
        if (!hasHeight) newAttrs += ` height="${height}"`;
        if (!hasViewBox) newAttrs += ` viewBox="0 0 ${width} ${height}"`;

        return `<svg${newAttrs}>`;
      }
    );

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: finalContent }}
      suppressHydrationWarning
    />
  );
});

export default DynamicSVG;
