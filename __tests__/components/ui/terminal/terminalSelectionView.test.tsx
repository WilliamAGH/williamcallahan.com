// __tests__/components/ui/terminal/terminalSelectionView.test.tsx

/**
 * Selection View Tests
 *
 * Tests selection view functionality with proper keyboard navigation
 * and accessibility support.
 */

import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { SelectionView } from "@/components/ui/terminal/selection-view.client";
import type { SelectionEntry } from "@/types/terminal";
import type { SelectionViewProps } from "@/types/ui/terminal";

describe("SelectionView Component", () => {
  const mockItems: SelectionEntry[] = [
    {
      id: "option-1",
      label: "Option 1",
      description: "First option",
      path: "/option1",
    },
    {
      id: "option-2",
      label: "Option 2",
      description: "Second option",
      path: "/option2",
    },
    {
      id: "option-3",
      label: "Option 3",
      description: "Third option",
      path: "/option3",
    },
  ];

  const mockHandlers = {
    onSelectAction: vi.fn<SelectionViewProps["onSelectAction"]>(),
    onExitAction: vi.fn<SelectionViewProps["onExitAction"]>(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    const options = within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "button",
    );
    expect(options).toHaveLength(mockItems.length);

    // Check first option is selected via aria-current
    expect(options[0]).toHaveAttribute("aria-current", "true");

    // Check other options are not selected
    expect(options[1]).not.toHaveAttribute("aria-current");
    expect(options[2]).not.toHaveAttribute("aria-current");
  });

  it("handles keyboard navigation", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const options = within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "button",
    );

    // Initial state - first option selected
    expect(options[0]).toHaveAttribute("aria-current", "true");

    // Navigate down
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowDown",
      });
    });
    expect(options[1]).toHaveAttribute("aria-current", "true");
    expect(options[0]).not.toHaveAttribute("aria-current");

    // Navigate down again
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowDown",
      });
    });
    expect(options[2]).toHaveAttribute("aria-current", "true");
    expect(options[1]).not.toHaveAttribute("aria-current");

    // Navigate up
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowUp",
      });
    });
    expect(options[1]).toHaveAttribute("aria-current", "true");
    expect(options[2]).not.toHaveAttribute("aria-current");
  });

  it("wraps around when navigating beyond bounds", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelectAction={mockHandlers.onSelectAction}
        onExitAction={mockHandlers.onExitAction}
      />,
    );

    const options = within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "button",
    );

    // Try to navigate up from first option - should stay at first
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowUp",
      });
    });
    expect(options[0]).toHaveAttribute("aria-current", "true");

    // Navigate down to last option
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowDown",
      });
    });
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowDown",
      });
    });
    expect(options[2]).toHaveAttribute("aria-current", "true");

    // Navigate down from last option - should stay at last
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowDown",
      });
    });
    expect(options[2]).toHaveAttribute("aria-current", "true");
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
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "ArrowDown",
      });
    });

    // Select option
    act(() => {
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "Enter",
      });
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
      fireEvent.keyDown(screen.getByRole("toolbar", { name: "Terminal search results" }), {
        key: "Escape",
      });
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

    const options = within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "button",
    );

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

    const options = within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "button",
    );

    // Hover over second option
    act(() => {
      fireEvent.mouseEnter(options[1]);
    });

    expect(options[1]).toHaveAttribute("aria-current", "true");
    expect(options[0]).not.toHaveAttribute("aria-current");
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
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
