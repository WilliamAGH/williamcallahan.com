import React from 'react';
import { render, screen } from '@testing-library/react';
import { CodeBlock } from '../../../components/ui/code-block';
import { CopyButton } from '../../../components/ui/copy-button';

// Mock CopyButton component
jest.mock('../../../components/ui/copy-button', () => ({
  CopyButton: jest.fn(({ content }) => (
    <button data-testid="mock-copy-button" data-content={content}>
      Copy
    </button>
  ))
}));

describe('CodeBlock', () => {
  beforeEach(() => {
    (CopyButton as jest.Mock).mockClear();
  });

  describe('Basic Rendering', () => {
    it('renders children within a pre element', () => {
      render(<CodeBlock>const x = 1;</CodeBlock>);
      expect(screen.getByText('const x = 1;')).toBeInTheDocument();
      expect(screen.getByText('const x = 1;').tagName).toBe('PRE');
    });

    it('applies correct styling classes', () => {
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

    it('includes a copy button', () => {
      render(<CodeBlock>test code</CodeBlock>);
      expect(screen.getByTestId('mock-copy-button')).toBeInTheDocument();
    });
  });

  describe('Text Content Extraction', () => {
    it('handles string children', () => {
      render(<CodeBlock>simple text</CodeBlock>);
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
        'data-content',
        'simple text'
      );
    });

    it('handles number children', () => {
      render(<CodeBlock>{42}</CodeBlock>);
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
        'data-content',
        '42'
      );
    });

    it('handles nested children', () => {
      render(
        <CodeBlock>
          <span>
            <strong>nested</strong>text
          </span>
        </CodeBlock>
      );
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
        'data-content',
        'nestedtext'
      );
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
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
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
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
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
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
        'data-content',
        'valid text'
      );
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
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
        'data-content',
        'const x = 1;'
      );
    });
  });

  describe('Props Handling', () => {
    it('forwards additional props to pre element', () => {
      render(
        <CodeBlock data-testid="test-pre" style={{ margin: '10px' }}>
          test code
        </CodeBlock>
      );
      const pre = screen.getByTestId('test-pre');
      expect(pre).toHaveStyle({ margin: '10px' });
    });

    it('merges custom className with default classes', () => {
      const { container } = render(
        <CodeBlock className="custom-class">
          test code
        </CodeBlock>
      );
      const pre = container.querySelector('pre');

      // Get all classes from the pre element
      const classes = pre?.className.split(' ') || [];

      // Verify all expected classes are present
      expect(classes).toContain('custom-class');
      expect(classes).toContain('not-prose');
      expect(classes).toContain('rounded-lg');
      expect(classes).toContain('overflow-x-auto');
      expect(classes).toContain('bg-gray-800');
      expect(classes).toContain('p-4');
      expect(classes).toContain('text-gray-100');
    });

    it('handles whitespace in text content', () => {
      render(
        <CodeBlock>
          <div>{'first line\nsecond line'}</div>
        </CodeBlock>
      );
      expect(screen.getByTestId('mock-copy-button')).toHaveAttribute(
        'data-content',
        'first line\nsecond line'
      );
    });
  });
});
