// __tests__/components/ui/terminal/terminalSelectionView.test.tsx

/**
 * Selection View Tests
 *
 * Tests selection view functionality with proper keyboard navigation
 * and accessibility support.
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { SelectionView } from "@/components/ui/terminal/selection-view.client";
import type { SelectionItem } from "@/types/terminal";

describe("SelectionView Component", () => {
  const mockItems: SelectionItem[] = [
    {
      id: "option1",
      label: "Option 1",
      value: "option1",
      action: "navigate",
      path: "/option1",
    },
    {
      id: "option2",
      label: "Option 2",
      value: "option2",
      action: "execute",
      command: "command2",
    },
    {
      id: "option3",
      label: "Option 3",
      value: "option3",
      action: "navigate",
      path: "/option3",
    },
  ];

  const mockHandlers = {
    onSelectAction: jest.fn(),
    onExitAction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders selection options with proper styling", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    // Check instructions
    expect(screen.getByText(/Use ↑↓ to navigate/)).toBeInTheDocument();

    // Check options (they have role="option" now for accessibility)
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(mockItems.length);

    // Check first option has selected styling
    expect(options[0]).toHaveClass("bg-blue-500/20", "text-blue-300");

    // Check other options don't have selected styling
    expect(options[1]).not.toHaveClass("bg-blue-500/20");
    expect(options[2]).not.toHaveClass("bg-blue-500/20");
  });

  it("handles keyboard navigation", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const options = screen.getAllByRole("option");
    const selectionView = screen.getByTestId("selection-view");

    // Initial state - first option selected
    expect(options[0]).toHaveClass("bg-blue-500/20");

    // Navigate down
    act(() => {
      fireEvent.keyDown(selectionView, { key: "ArrowDown" });
    });
    expect(options[1]).toHaveClass("bg-blue-500/20");
    expect(options[0]).not.toHaveClass("bg-blue-500/20");

    // Navigate down again
    act(() => {
      fireEvent.keyDown(selectionView, { key: "ArrowDown" });
    });
    expect(options[2]).toHaveClass("bg-blue-500/20");
    expect(options[1]).not.toHaveClass("bg-blue-500/20");

    // Navigate up
    act(() => {
      fireEvent.keyDown(selectionView, { key: "ArrowUp" });
    });
    expect(options[1]).toHaveClass("bg-blue-500/20");
    expect(options[2]).not.toHaveClass("bg-blue-500/20");
  });

  it("wraps around when navigating beyond bounds", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const options = screen.getAllByRole("option");
    const selectionView = screen.getByTestId("selection-view");

    // Try to navigate up from first option - should wrap to last
    act(() => {
      fireEvent.keyDown(selectionView, { key: "ArrowUp" });
    });
    expect(options[2]).toHaveClass("bg-blue-500/20");

    // Navigate down from last option - should wrap to first
    act(() => {
      fireEvent.keyDown(selectionView, { key: "ArrowDown" });
    });
    expect(options[0]).toHaveClass("bg-blue-500/20");
  });

  it("handles selection with Enter key", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const selectionView = screen.getByTestId("selection-view");

    // Navigate to second option
    act(() => {
      fireEvent.keyDown(selectionView, { key: "ArrowDown" });
    });

    // Select option
    act(() => {
      fireEvent.keyDown(selectionView, { key: "Enter" });
    });

    expect(mockHandlers.onSelectAction).toHaveBeenCalledWith(mockItems[1]);
  });

  it("handles escape to exit", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const selectionView = screen.getByTestId("selection-view");

    act(() => {
      fireEvent.keyDown(selectionView, { key: "Escape" });
    });

    expect(mockHandlers.onExitAction).toHaveBeenCalled();
  });

  it("handles mouse selection", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const options = screen.getAllByRole("option");

    // Click second option
    act(() => {
      fireEvent.click(options[1]);
    });

    expect(mockHandlers.onSelectAction).toHaveBeenCalledWith(mockItems[1]);
  });

  it("handles mouse hover to change selection", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const options = screen.getAllByRole("option");

    // Hover over second option
    act(() => {
      fireEvent.mouseEnter(options[1]);
    });

    expect(options[1]).toHaveClass("bg-blue-500/20");
    expect(options[0]).not.toHaveClass("bg-blue-500/20");
  });

  it("shows keyboard navigation instructions", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const instructions = screen.getByText(/Use ↑↓ to navigate/);
    expect(instructions).toBeInTheDocument();
    expect(instructions).toHaveTextContent(/Enter to select/);
    expect(instructions).toHaveTextContent(/Esc to cancel/);
  });

  it("handles empty items array", () => {
    render(
      <SelectionView
        items={[]}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    // Should still show instructions
    expect(screen.getByText(/Use ↑↓ to navigate/)).toBeInTheDocument();

    // But no options
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
