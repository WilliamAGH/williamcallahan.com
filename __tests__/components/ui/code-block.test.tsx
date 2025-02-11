import React from 'react';
import { screen, render } from '@testing-library/react';
import { act } from '../../../lib/test/setup';
import { CodeBlock } from '../../../components/ui/code-block';
import { CopyButton } from '../../../components/ui/copy-button';

// Mock CopyButton component
jest.mock('../../../components/ui/copy-button', () => ({
  CopyButton: jest.fn(({ content }) => (
    <button
      role="button"
      aria-label="Copy code"
      data-content={content}
    >
      Copy code
    </button>
  ))
}));

describe('CodeBlock', () => {
  beforeEach(() => {
    (CopyButton as jest.Mock).mockClear();
  });

  describe('Basic Rendering', () => {
    it('renders code content within a pre element', () => {
      render(<CodeBlock>const x = 1;</CodeBlock>);
      const pre = screen.getByText('const x = 1;');
      expect(pre).toBeInTheDocument();
      expect(pre.tagName).toBe('PRE');
    });

    it('applies correct styling classes for code block', () => {
      render(<CodeBlock>test code</CodeBlock>);
      const pre = screen.getByText('test code');
      expect(pre).toHaveClass(
        'not-prose',
        'rounded-lg',
        'overflow-x-auto',
        'bg-gray-800',
        'p-4',
        'text-gray-100'
      );
    });

    it('includes an accessible copy button', () => {
      render(<CodeBlock>test code</CodeBlock>);
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toBeInTheDocument();
      expect(copyButton).toHaveAttribute('data-content', 'test code');
    });
  });

  describe('Text Content Extraction', () => {
    it('handles string children', () => {
      render(<CodeBlock>simple text</CodeBlock>);
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute('data-content', 'simple text');
    });

    it('handles number children', () => {
      render(<CodeBlock>{42}</CodeBlock>);
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute('data-content', '42');
    });

    it('handles nested children', () => {
      render(
        <CodeBlock>
          <span>
            <strong>nested</strong>text
          </span>
        </CodeBlock>
      );
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute('data-content', 'nestedtext');
    });

    it('filters out comment lines', () => {
      render(
        <CodeBlock>
          {`# This is a comment
const x = 1;
# Another comment
const y = 2;`}
        </CodeBlock>
      );
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute(
        'data-content',
        'const x = 1;\nconst y = 2;'
      );
    });

    it('handles array of children', () => {
      render(
        <CodeBlock>
          {['const x = 1;', <span key="span">const y = 2;</span>]}
        </CodeBlock>
      );
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute(
        'data-content',
        'const x = 1;const y = 2;'
      );
    });

    it('handles null and undefined children', () => {
      render(
        <CodeBlock>
          {null}
          {undefined}
          valid text
          {null}
        </CodeBlock>
      );
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute('data-content', 'valid text');
    });

    it('handles deeply nested comments', () => {
      render(
        <CodeBlock>
          <div>
            <span>
              {`# Nested comment
                const x = 1;`}
            </span>
          </div>
        </CodeBlock>
      );
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute('data-content', 'const x = 1;');
    });
  });

  describe('Props Handling', () => {
    it('forwards additional props to pre element', () => {
      render(
        <CodeBlock aria-label="Example code" style={{ margin: '10px' }}>
          test code
        </CodeBlock>
      );
      const pre = screen.getByText('test code');
      expect(pre).toHaveStyle({ margin: '10px' });
      expect(pre).toHaveAttribute('aria-label', 'Example code');
    });

    it('merges custom className with default classes', () => {
      const { container } = render(
        <CodeBlock className="custom-class">
          test code
        </CodeBlock>
      );
      const pre = container.querySelector('pre');
      expect(pre).toHaveClass(
        'custom-class',
        'not-prose',
        'rounded-lg',
        'overflow-x-auto',
        'bg-gray-800',
        'p-4',
        'text-gray-100'
      );
    });

    it('handles whitespace in text content', () => {
      render(
        <CodeBlock>
          <div>{'first line\nsecond line'}</div>
        </CodeBlock>
      );
      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toHaveAttribute(
        'data-content',
        'first line\nsecond line'
      );
    });
  });
});
