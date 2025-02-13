/**
 * Selection View Tests
 *
 * Tests selection view functionality with proper keyboard navigation
 * and accessibility support.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionView } from "@/components/ui/terminal/selectionView";
import type { SelectionItem } from "@/types/terminal";

describe("SelectionView Component", () => {
  const mockItems: SelectionItem[] = [
    {
      label: "Option 1",
      value: "option1",
      action: "navigate",
      path: "/option1"
    },
    {
      label: "Option 2",
      value: "option2",
      action: "execute"
    },
    {
      label: "Option 3",
      value: "option3",
      action: "navigate",
      path: "/option3"
    }
  ];

  const mockHandlers = {
    onSelect: jest.fn(),
    onExit: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders selection options with proper accessibility", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockHandlers.onSelect}
        onExit={mockHandlers.onExit}
      />
    );

    // Check container accessibility
    const container = screen.getByRole("listbox", { name: /available options/i });
    expect(container).toBeInTheDocument();

    // Check options
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(mockItems.length);

    // Check first option has correct styling
    expect(options[0]).toHaveClass("bg-gray-700");

    // Check other options don't have selected styling
    expect(options[1]).not.toHaveClass("bg-gray-700");
    expect(options[2]).not.toHaveClass("bg-gray-700");
  });

  it("handles selection with Enter key", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockHandlers.onSelect}
        onExit={mockHandlers.onExit}
      />
    );

    const options = screen.getAllByRole("option");

    // Press Enter on first option
    fireEvent.keyDown(options[0], { key: "Enter" });
    expect(mockHandlers.onSelect).toHaveBeenCalledWith(mockItems[0]);
  });

  it("handles escape to exit", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockHandlers.onSelect}
        onExit={mockHandlers.onExit}
      />
    );

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(mockHandlers.onExit).toHaveBeenCalled();
  });

  it("handles mouse selection", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockHandlers.onSelect}
        onExit={mockHandlers.onExit}
      />
    );

    const options = screen.getAllByRole("option");

    // Click second option
    fireEvent.click(options[1]);
    expect(mockHandlers.onSelect).toHaveBeenCalledWith(mockItems[1]);
  });

  it("shows keyboard navigation instructions", () => {
    render(
      <SelectionView
        items={mockItems}
        onSelect={mockHandlers.onSelect}
        onExit={mockHandlers.onExit}
      />
    );

    const instructions = screen.getByRole('note');
    expect(instructions).toHaveTextContent(/Use arrow keys to navigate/i);
    expect(instructions).toHaveTextContent(/Enter to select/i);
    expect(instructions).toHaveTextContent(/Esc to cancel/i);
  });
});
