import { render, screen, fireEvent, act } from '@testing-library/react';
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
    it('moves selection down with arrow down', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      });
      expect(screen.getByText('Item 2').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('moves selection up with arrow up', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      // Move down first to test moving up
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        fireEvent.keyDown(window, { key: 'ArrowUp' });
      });
      expect(screen.getByText('Item 1').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('wraps to bottom when pressing up at top', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowUp' });
      });
      expect(screen.getByText('Item 3').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('wraps to top when pressing down at bottom', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      // Move to bottom
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        // Should wrap to top
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      });
      expect(screen.getByText('Item 1').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('selects item with enter key', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      // Move to second item
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      });

      // Then select it
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });
      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[1]);
    });

    it('exits with escape key', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(mockOnExit).toHaveBeenCalled();
    });
  });

  describe('mouse interactions', () => {
    it('updates selection on mouse hover', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      act(() => {
        fireEvent.mouseEnter(screen.getByText('Item 2'));
      });
      expect(screen.getByText('Item 2').closest('div')).toHaveClass('bg-blue-500/20');
    });

    it('selects item on click', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      act(() => {
        fireEvent.click(screen.getByText('Item 2'));
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

    it('prevents default on navigation key events', () => {
      render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      jest.spyOn(event, 'preventDefault');
      act(() => {
        window.dispatchEvent(event);
      });
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('cleans up event listeners on unmount', () => {
      const { unmount } = render(
        <SelectionView
          items={mockItems}
          onSelect={mockOnSelect}
          onExit={mockOnExit}
        />
      );

      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      unmount();
      expect(removeEventListenerSpy).toHaveBeenCalled();
      removeEventListenerSpy.mockRestore();
    });
  });
});
