// __tests__/components/ui/terminal/history.test.tsx

/**
 * Terminal History Tests
 *
 * Tests terminal history functionality with proper state management and cleanup.
 */

import { render, screen } from "@testing-library/react";
import { History } from "@/components/ui/terminal/history";
import type { TerminalCommand } from "@/types/terminal";

describe("History Component", () => {
  const mockHistory: TerminalCommand[] = [
    {
      input: "test command",
      output: "test output"
    },
    {
      input: "",
      output: "system message"
    },
    {
      input: "another command",
      output: ""
    }
  ];

  it("renders command history with proper structure", () => {
    render(<History history={mockHistory} />);

    // Check container accessibility
    const container = screen.getByRole("log", { name: /terminal command history/i });
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("aria-live", "polite");
    expect(container).toHaveAttribute("aria-atomic", "false");

    // Check command inputs
    const prompts = screen.getAllByText("$");
    expect(prompts).toHaveLength(2); // Only for actual commands

    // Check command outputs
    const outputs = screen.getAllByRole("status");
    expect(outputs).toHaveLength(2); // Only for non-empty outputs

    // Check specific content
    expect(screen.getByText("test command")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /output for test command/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /output for command/i })).toBeInTheDocument();
    expect(screen.getByText("another command")).toBeInTheDocument();
  });

  it("handles empty history", () => {
    render(<History history={[]} />);
    const container = screen.getByRole("log", { name: /terminal command history/i });
    expect(container).toBeInTheDocument();
    expect(container.children).toHaveLength(0);
  });

  it("provides proper output labels", () => {
    render(<History history={mockHistory} />);

    // Check output accessibility labels
    expect(screen.getByRole("status", { name: /output for test command/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /output for command/i })).toBeInTheDocument(); // For system message
  });

  it("maintains order of commands", () => {
    render(<History history={mockHistory} />);

    const container = screen.getByRole("log");
    const items = container.children;

    // Check order of items
    expect(items[0]).toHaveTextContent("test command");
    expect(items[0]).toHaveTextContent("test output");
    expect(items[1]).toHaveTextContent("system message");
    expect(items[2]).toHaveTextContent("another command");
  });

  it("handles commands with only input", () => {
    const inputOnlyHistory: TerminalCommand[] = [
      {
        input: "command without output",
        output: ""
      }
    ];

    render(<History history={inputOnlyHistory} />);
    expect(screen.getByText("command without output")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("handles commands with only output", () => {
    const outputOnlyHistory: TerminalCommand[] = [
      {
        input: "",
        output: "system output only"
      }
    ];

    render(<History history={outputOnlyHistory} />);
    expect(screen.queryByText("$")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: /output for command/i })).toBeInTheDocument();
  });
});
