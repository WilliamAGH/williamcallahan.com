import React from 'react';
import { render, screen } from '@testing-library/react';
import { CodeBlock } from '../../../components/ui/codeBlock';
import { CopyButton } from '../../../components/ui/copyButton';

// Mock CopyButton component
jest.mock('../../../components/ui/copyButton', () => ({
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
    it('renders children within a code element', () => {
      render(<CodeBlock>const x = 1;</CodeBlock>);
      const code = screen.getByText('const x = 1;');
      expect(code).toBeInTheDocument();
      expect(code.tagName).toBe('CODE');
    });

    it('applies correct styling classes', () => {
      render(<CodeBlock>test code</CodeBlock>);
      const code = screen.getByText('test code');
      expect(code).toHaveClass(
        'text-gray-100',
        'bg-transparent',
        'text-[13px]',
        '[&_*]:!text-gray-100',
        '[&_*]:!bg-transparent'
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
      expect(pre).toHaveClass(
        'custom-class',
        'not-prose',
        'rounded-lg',
        'overflow-x-auto',
        'bg-gray-800',
        'p-4',
        'text-gray-100',
        'text-[13px]'
      );
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
