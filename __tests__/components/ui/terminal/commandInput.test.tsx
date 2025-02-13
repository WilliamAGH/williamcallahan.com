/**
 * Command Input Tests
 *
 * Tests the terminal command input component with proper accessibility and state management.
 * Verifies input handling, form submission, and disabled states.
 *
 * CRITICAL: Read docs/development/testing.md before modifying tests!
 * React 18 + Jest requires special handling for:
 * - Focus management (JSDOM limitations)
 * - Concurrent mode effects
 * - State batching
 * - Proper cleanup
 *
 * @module __tests__/components/ui/terminal/commandInput
 * @see {@link CommandInput} - Component being tested
 * @see {@link docs/development/testing.md} - Critical testing guidelines
 */

import { render, fireEvent, screen } from '@testing-library/react';
import { CommandInput } from '@/components/ui/terminal/client';
import { createRef } from 'react';

describe('CommandInput Component', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    inputRef: createRef<HTMLInputElement>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Accessibility Tests
   * Verifying proper ARIA attributes and roles
   */
  describe('Accessibility', () => {
    it('renders with proper accessibility attributes', () => {
      render(<CommandInput {...defaultProps} />);

      // Form should have search role and label
      const form = screen.getByRole('search', { name: /terminal command input/i });
      expect(form).toBeInTheDocument();

      // Input should have searchbox role and label
      const input = screen.getByRole('searchbox', { name: /enter command/i });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-label', 'Enter command');
    });
  });

  /**
   * Input Handling Tests
   * Verifying proper state management and event handling
   */
  describe('Input Handling', () => {
    it('handles input changes', () => {
      render(<CommandInput {...defaultProps} />);
      const input = screen.getByRole('searchbox', { name: /enter command/i });

      fireEvent.change(input, { target: { value: 'test' } });
      expect(defaultProps.onChange).toHaveBeenCalledWith('test');
    });

    it('handles form submission', () => {
      render(<CommandInput {...defaultProps} value="test command" />);
      const form = screen.getByRole('search');

      fireEvent.submit(form);
      expect(defaultProps.onSubmit).toHaveBeenCalled();
    });
  });

  /**
   * Disabled State Tests
   * Verifying proper handling of disabled state
   */
  describe('Disabled State', () => {
    it('handles disabled state', () => {
      render(<CommandInput {...defaultProps} disabled />);
      const input = screen.getByRole('searchbox', { name: /enter command/i });

      expect(input).toBeDisabled();
      fireEvent.change(input, { target: { value: 'test' } });
      expect(defaultProps.onChange).not.toHaveBeenCalled();
    });
  });

  /**
   * Focus Management Tests
   * Verifying proper focus handling
   * Note: Focus tests are skipped due to JSDOM limitations
   * @see {@link docs/development/testing.md#focus-management-in-jsdom}
   */
  describe('Focus Management', () => {
    // Skip focus test since we can't reliably test focus in JSDOM
    it.skip('maintains focus state', () => {
      render(<CommandInput {...defaultProps} />);
      const input = screen.getByRole('searchbox', { name: /enter command/i });

      input.focus();
      expect(input).toHaveFocus();
    });
  });

  /**
   * Edge Cases
   * Testing boundary conditions and special cases
   */
  describe('Edge Cases', () => {
    it('allows form submission regardless of input', () => {
      render(<CommandInput {...defaultProps} value="   " />);
      const form = screen.getByRole('search');

      fireEvent.submit(form);
      expect(defaultProps.onSubmit).toHaveBeenCalled();
    });

    it('handles long input values', () => {
      const longInput = 'a'.repeat(100);
      render(<CommandInput {...defaultProps} value={longInput} />);
      const input = screen.getByRole('searchbox', { name: /enter command/i });

      expect(input).toHaveValue(longInput);
    });
  });
});
