'use client';

import { useEffect, useRef } from 'react';
import { CodeBlock } from './code-block.client';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import { processSvgTransforms } from '@/lib/utils/svg-transform-fix';

type PreProps = DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement>;

/**
 * Server component for initial render
 * This is what gets used during MDX serialization
 */
import { cn } from '@/lib/utils'; // Import cn utility

export function ServerMDXCodeBlock(props: PreProps) {
  // Destructure className and children from props
  const { children, className, ...rest } = props;

  // Define default classes for the PRE tag - make sure they match the CodeBlock component
  const preClasses = cn(
    'not-prose',
    'overflow-x-auto',
    'text-gray-100',
    'text-[13px]',
    'break-words',
    'whitespace-pre-wrap',
    'custom-scrollbar',
    'p-4',
    'language-*', // Add this so PrismJS styles apply properly
    // No rounded borders or margin here to ensure proper alignment
    'border-t-0'
  );

  // Define classes for the wrapping DIV
  const wrapperClasses = cn(
    'relative group w-full'
    // No border, rounded corners handled by CodeBlock on client hydration
  );

  return (
    // Keep a simple wrapper structure for server-side rendering
    // The full styling will be applied when CodeBlock hydrates
    <div className={wrapperClasses}>
      {/* Merge incoming className (from rehypePrism) with default pre classes */}
      <pre className={cn(preClasses, className)} {...rest} style={{ width: '100%' }}>
        {children}
      </pre>
    </div>
  );
}

/**
 * Client component that gets hydrated with the CodeBlock component
 * This prevents the useState error during MDX serialization
 */
export function MDXCodeBlock(props: PreProps & { embeddedInTabFrame?: boolean }) {
  const { children, className, embeddedInTabFrame, ...rest } = props;
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Client-side only code
    if (codeRef.current) {
      const codeContent = codeRef.current.textContent || '';
      codeRef.current.setAttribute('data-code-content', codeContent);

      // Fix SVG transform attributes in any SVGs within code blocks
      const svgs = codeRef.current.querySelectorAll('svg');
      svgs.forEach(svg => {
        processSvgTransforms(svg);
      });
    }
  }, []);

  return (
    <div ref={codeRef} data-mdx-code className="group w-full">
      <CodeBlock className={className} embeddedInTabFrame={embeddedInTabFrame} {...rest}>
        {children}
      </CodeBlock>
    </div>
  );
}
