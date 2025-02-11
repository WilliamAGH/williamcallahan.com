import { render, screen, fireEvent } from '@testing-library/react';
import { act } from '../../../../lib/test/setup';
import { SelectionView } from '@/components/ui/terminal/selection-view';
import type { SelectionItem } from '@/types/terminal';

describe('SelectionView', () => {
  const mockItems: SelectionItem[] = [
    { label: 'Item 1', description: 'First item', path: '/item1' },
    { label: 'Item 2', description: 'Second item', path: '/item2' },
    { label: 'Item 3', description: 'Third item', path: '/item3' },
  ];
  const mockOnSelect = jest.fn();
  const mockOnExit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all items correctly', () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockOnSelect}
        onExit={mockOnExit}
      />
    );

    mockItems.forEach((item) => {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    });

    expect(screen.getByText(/use ↑↓ to navigate/i)).toBeInTheDocument();
  });

  it('highlights the first item by default', () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockOnSelect}
        onExit={mockOnExit}
      />
    );

    const firstItem = screen.getByText('Item 1').closest('div');
    expect(firstItem).toHaveClass('bg-blue-500/20');
  });

  describe('keyboard navigation', () => {
    it('moves selection down with arrow down', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        await Promise.resolve();
      });

      expect(screen.getByText('Item 2').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('moves selection up with arrow up', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      // Move down first to test moving up
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        await Promise.resolve();
        fireEvent.keyDown(window, { key: 'ArrowUp' });
        await Promise.resolve();
      });

      expect(screen.getByText('Item 1').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('wraps to bottom when pressing up at top', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowUp' });
        await Promise.resolve();
      });

      expect(screen.getByText('Item 3').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('wraps to top when pressing down at bottom', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      // Move to bottom
      await act(async () => {
        // First to Item 2
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        await Promise.resolve();
        // Then to Item 3
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        await Promise.resolve();
        // Should wrap to Item 1
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        await Promise.resolve();
      });

      expect(screen.getByText('Item 1').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('selects item with enter key', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      // Move to second item and wait for state update
      await act(async () => {
        fireEvent.mouseEnter(screen.getByText('Item 2'));
        await Promise.resolve();
      });

      // Verify second item is selected
      expect(screen.getByText('Item 2').closest('div')).toHaveClass('bg-blue-500/20');

      // Now press enter
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Enter' });
        await Promise.resolve();
      });

      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[1]);
    });

    it('exits with escape key', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
        await Promise.resolve();
      });

      expect(mockOnExit).toHaveBeenCalled();
    });
  });

  describe('mouse interactions', () => {
    it('updates selection on mouse hover', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      await act(async () => {
        fireEvent.mouseEnter(screen.getByText('Item 2'));
        await Promise.resolve();
      });

      expect(screen.getByText('Item 2').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('selects item on click', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Item 2'));
        await Promise.resolve();
      });

      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[1]);
    });
  });

  describe('edge cases', () => {
    it('handles empty items array', () => {
      render(
        <SelectionView
          items={[]}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      expect(screen.getByText(/use ↑↓ to navigate/i)).toBeInTheDocument();
    });

    it('prevents default on navigation key events', async () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      jest.spyOn(event, 'preventDefault');

      await act(async () => {
        window.dispatchEvent(event);
        await Promise.resolve();
      });

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('cleans up event listeners on unmount', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalled();
      removeEventListenerSpy.mockRestore();
    });
  });
});
