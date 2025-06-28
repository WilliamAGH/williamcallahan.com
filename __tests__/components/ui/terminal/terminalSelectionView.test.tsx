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
      label: "Option 1",
      value: "option1",
      action: "navigate",
      path: "/option1",
    },
    {
      label: "Option 2",
      value: "option2",
      action: "execute",
      command: "command2",
    },
    {
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

    // Check options
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(mockItems.length);

    // Check first option is selected via aria-selected
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Check other options are not selected
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
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

    // Initial state - first option selected
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Navigate down
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");

    // Navigate down again
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    });
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");

    // Navigate up
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
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

    // Try to navigate up from first option - should stay at first
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    });
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Navigate down to last option
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    });
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    });
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    
    // Navigate down from last option - should stay at last
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    });
    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });

  it("handles selection with Enter key", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    // Navigate to second option
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    });

    // Select option
    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });
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

    act(() => {
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
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

    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
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
