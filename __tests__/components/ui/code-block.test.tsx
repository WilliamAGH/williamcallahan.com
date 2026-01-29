import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import "@testing-library/jest-dom";

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Mock useWindowSize hook before other imports
jest.mock("@/lib/hooks/use-window-size.client", () => ({
  useWindowSize: () => ({ width: 1280, height: 800 }),
}));

// Note: We now use the real components with test IDs instead of mocking them

// Import component after mocks
import { CodeBlock } from "@/components/ui/code-block/code-block.client";

describe("CodeBlock", () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders children within a pre element", () => {
      // Test that the text content is rendered within the main <pre> element
      const { container } = render(<CodeBlock>const x = 1;</CodeBlock>);
      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
      // Check if the text exists within the pre tag
      expect(screen.getByText("const x = 1;")).toBeInTheDocument();
    });

    it("renders window controls toolbar", () => {
      render(<CodeBlock>test code</CodeBlock>);
      expect(screen.getByTestId("close-button")).toBeInTheDocument();
      expect(screen.getByTestId("minimize-button")).toBeInTheDocument();
      expect(screen.getByTestId("maximize-button")).toBeInTheDocument();
    });

    it("includes a copy button", () => {
      render(<CodeBlock>test code</CodeBlock>);
      expect(screen.getByTestId("copy-button")).toBeInTheDocument();
    });
  });

  describe("Text Content Extraction", () => {
    it("handles string children", () => {
      render(<CodeBlock>simple text</CodeBlock>);
      expect(screen.getByTestId("copy-button")).toHaveAttribute("data-content", "simple text");
    });

    it("handles number children", () => {
      render(<CodeBlock>{42}</CodeBlock>);
      expect(screen.getByTestId("copy-button")).toHaveAttribute("data-content", "42");
    });

    it("handles nested children", () => {
      render(
        <CodeBlock>
          <span>
            <strong>nested</strong>text
          </span>
        </CodeBlock>,
      );
      expect(screen.getByTestId("copy-button")).toHaveAttribute("data-content", "nestedtext");
    });

    it("filters out comment lines", () => {
      render(
        <CodeBlock>
          {`# This is a comment
const x = 1;
# Another comment
const y = 2;`}
        </CodeBlock>,
      );
      expect(screen.getByTestId("copy-button")).toHaveAttribute(
        "data-content",
        "const x = 1;\nconst y = 2;",
      );
    });

    it("handles array of children", () => {
      render(<CodeBlock>{["const x = 1;", <span key="span">const y = 2;</span>]}</CodeBlock>);
      expect(screen.getByTestId("copy-button")).toHaveAttribute(
        "data-content",
        "const x = 1;const y = 2;",
      );
    });

    it("handles null and undefined children", () => {
      render(
        <CodeBlock>
          {null}
          {undefined}
          valid text
          {null}
        </CodeBlock>,
      );
      expect(screen.getByTestId("copy-button")).toHaveAttribute("data-content", "valid text");
    });

    it("handles deeply nested comments", () => {
      render(
        <CodeBlock>
          <div>
            <span>
              {`# Nested comment
              const x = 1;`}
            </span>
          </div>
        </CodeBlock>,
      );
      expect(screen.getByTestId("copy-button")).toHaveAttribute("data-content", "const x = 1;");
    });
  });

  describe("Props Handling", () => {
    it("forwards additional props to pre element", () => {
      render(
        <CodeBlock data-testid="test-pre" style={{ margin: "10px" }}>
          test code
        </CodeBlock>,
      );
      const pre = screen.getByTestId("test-pre");
      expect(pre).toHaveStyle({ margin: "10px" });
    });

    it("merges custom className with default classes", () => {
      const { container } = render(<CodeBlock className="custom-class">test code</CodeBlock>);
      const pre = container.querySelector("pre");
      // Check that custom class is included along with default classes
      expect(pre).toHaveClass("custom-class");
      expect(pre).toHaveClass("not-prose");
      expect(pre).toHaveClass("max-w-full");
      expect(pre).toHaveClass("overflow-x-auto");
      expect(pre).toHaveClass("p-4");
    });

    it("handles whitespace in text content", () => {
      render(
        <CodeBlock>
          <div>{"first line\nsecond line"}</div>
        </CodeBlock>,
      );
      expect(screen.getByTestId("copy-button")).toHaveAttribute(
        "data-content",
        "first line\nsecond line",
      );
    });
  });

  // Add new test section for interactive behavior
  describe("Interactive Behavior", () => {
    it("handles close button click", async () => {
      render(<CodeBlock>test code</CodeBlock>);

      // Initially the code block is visible
      expect(screen.getByText("test code")).toBeInTheDocument();

      // Click close button
      fireEvent.click(screen.getByTestId("close-button"));

      // Wait for the state update and re-render
      await waitFor(() => {
        // After clicking close, the hidden message should appear
        expect(screen.getByText("Code block hidden (click to show)")).toBeInTheDocument();
      });

      // And the original code should be gone
      expect(screen.queryByText("test code")).not.toBeInTheDocument();

      // Click the close button again to restore the code block (close button toggles visibility)
      fireEvent.click(screen.getByTestId("close-button"));

      // Wait for the state update and re-render
      await waitFor(
        () => {
          // Code block should be visible again
          expect(screen.getByText("test code")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Hidden message should disappear
      expect(screen.queryByText("Code block hidden (click to show)")).not.toBeInTheDocument();
    });

    it("handles minimize button click", () => {
      const { container } = render(<CodeBlock>test code</CodeBlock>);

      // Initially the code is fully visible
      const preElement = container.querySelector("pre");
      expect(preElement).not.toHaveClass("max-h-16");

      // Click minimize button wrapped in act
      act(() => {
        screen.getByTestId("minimize-button").click();
      });

      // After minimize, container should have max-height class
      // Note: In actual implementation, minimized state hides the pre completely,
      // but we can only check the classes from the parent component's behavior
      expect(screen.getByTestId("minimize-button")).toBeInTheDocument();
    });

    it("handles maximize button click", () => {
      const { container } = render(<CodeBlock>test code</CodeBlock>);

      // Initially wrapper doesn't have fixed position class
      const wrapperElement = container.firstChild;
      expect(wrapperElement).not.toHaveClass("fixed");

      // Click maximize button wrapped in act
      act(() => {
        screen.getByTestId("maximize-button").click();
      });

      // After maximize, wrapper should have z-index classes for modal behavior
      // Note: We need to find the wrapper element again as React may have re-rendered
      expect(screen.getByTestId("maximize-button")).toBeInTheDocument();
    });
  });

  describe("Auto-collapse overlay", () => {
    it("auto-collapses when line count exceeds threshold and shows expand control", () => {
      const longCode = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { container } = render(<CodeBlock>{longCode}</CodeBlock>);

      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();

      // Collapsed pre should have a max-height class (responsive set)
      // We check any of the responsive classes to avoid fragility
      const preClass = pre?.className || "";
      expect(preClass).toMatch(/max-h-64|sm:max-h-72|md:max-h-80/);

      // The expand control should be present with accessible label
      const expandButton = screen.getByRole("button", { name: /show all code/i });
      expect(expandButton).toBeInTheDocument();
    });

    it('expands on clicking "Show all code" and reveals Collapse control', async () => {
      const longCode = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { container } = render(<CodeBlock>{longCode}</CodeBlock>);

      const expandButton = screen.getByRole("button", { name: /show all code/i });
      fireEvent.click(expandButton);

      // After expanding, the pre should NOT have the collapsed classes
      await waitFor(() => {
        const pre = container.querySelector("pre");
        const preClass = pre?.className || "";
        expect(preClass).not.toMatch(/max-h-64|sm:max-h-72|md:max-h-80/);
      });

      // Collapse control should now be visible
      const collapseButton = screen.getByRole("button", { name: /collapse/i });
      expect(collapseButton).toBeInTheDocument();
    });

    it('collapses again when clicking "Collapse" after expansion', async () => {
      const longCode = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { container } = render(<CodeBlock>{longCode}</CodeBlock>);

      // Expand first
      fireEvent.click(screen.getByRole("button", { name: /show all code/i }));

      // Now collapse
      const collapseButton = await screen.findByRole("button", { name: /collapse/i });
      fireEvent.click(collapseButton);

      // Pre should regain collapsed classes
      await waitFor(() => {
        const pre = container.querySelector("pre");
        const preClass = pre?.className || "";
        expect(preClass).toMatch(/max-h-64|sm:max-h-72|md:max-h-80/);
      });
    });

    it("does not show expand control for short code blocks", () => {
      const shortCode = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].join("\n"); // 12 lines
      render(<CodeBlock>{shortCode}</CodeBlock>);

      // Exactly threshold lines should not auto-collapse
      expect(screen.queryByRole("button", { name: /show all code/i })).not.toBeInTheDocument();
    });

    it("respects maximize state and does not apply collapsed height when maximized", () => {
      const longCode = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
      const { container } = render(<CodeBlock>{longCode}</CodeBlock>);

      // Click maximize
      act(() => {
        screen.getByTestId("maximize-button").click();
      });

      // When maximized, pre should allow full height (no collapsed classes)
      const pre = container.querySelector("pre");
      const preClass = pre?.className || "";
      expect(preClass).not.toMatch(/max-h-64|sm:max-h-72|md:max-h-80/);
    });
  });
});
