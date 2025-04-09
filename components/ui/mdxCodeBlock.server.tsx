'use client';

import { useEffect, useRef } from 'react';
import { CodeBlock } from './codeBlock';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type PreProps = DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement>;

/**
 * Server component for initial render
 * This is what gets used during MDX serialization
 */
export function ServerMDXCodeBlock(props: PreProps) {
  const { children, className, ...rest } = props;
  return (
    <pre
      // Removed p-4 from here, as CodeBlock applies it
      className="not-prose rounded-lg overflow-x-auto bg-gray-800 text-gray-100 text-[13px]"
      {...rest}
    >
      <code className="text-gray-100 bg-transparent text-[13px]">{children}</code>
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
    // Client-side only code
    if (codeRef.current) {
      const codeContent = codeRef.current.textContent || '';
      codeRef.current.setAttribute('data-code-content', codeContent);
    }
  }, []);

  return (
    <div ref={codeRef} data-mdx-code>
      <CodeBlock className={className} {...rest}>
        {children}
      </CodeBlock>
    </div>
  );
}
