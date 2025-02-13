'use client';

import { useEffect, useRef, memo } from 'react';
import { CodeBlock } from './codeBlock';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import SVG components to prevent hydration issues
const DynamicSVG = dynamic(() => import('./dynamicSvg'), { ssr: true });

type PreProps = DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement>;

/**
 * Server component for initial render
 * This is what gets used during MDX serialization
 */
export function ServerMDXCodeBlock(props: PreProps) {
  const { children, className, ...rest } = props;
  return (
    <pre className={className} {...rest}>
      <code>{children}</code>
    </pre>
  );
}

/**
 * Client component that gets hydrated with the CodeBlock component
 * This prevents the useState error during MDX serialization
 */
export function MDXCodeBlock(props: PreProps) {
  const { children, className, ...rest } = props;
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!codeRef.current) return;

    // Store original content for hydration matching
    const codeContent = codeRef.current.textContent || '';
    codeRef.current.setAttribute('data-code-content', codeContent);

    // Process any SVG content
    const svgElements = codeRef.current.getElementsByTagName('svg');
    Array.from(svgElements).forEach((svg, index) => {
      // Add unique identifier for hydration
      svg.setAttribute('data-svg-id', `mdx-svg-${index}`);

      // Ensure proper MIME type
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }

      // Add proper sizing if missing
      if (!svg.getAttribute('width') && !svg.getAttribute('height')) {
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
      }

      // Ensure viewBox is present
      if (!svg.getAttribute('viewBox') && svg.getAttribute('width') && svg.getAttribute('height')) {
        svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
      }
    });
  }, []);

  return (
    <div ref={codeRef} data-mdx-code>
      <CodeBlock
        className={className}
        {...rest}
        // Ensure proper MIME type handling for SVG content
        dangerouslySetInnerHTML={
          typeof children === 'string' && children.includes('<svg')
            ? { __html: children }
            : undefined
        }
      >
        {typeof children === 'string' && !children.includes('<svg')
          ? children
          : null}
      </CodeBlock>
    </div>
  );
}
