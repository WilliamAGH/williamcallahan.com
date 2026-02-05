import type { Mock } from "vitest";
import React from "react"; // Ensure React is imported first
import { render, screen, fireEvent } from "@testing-library/react";
import { Terminal } from "../../../../src/components/ui/terminal/terminal-implementation.client";
import { TerminalProvider } from "../../../../src/components/ui/terminal/terminal-context.client";
import { useRegisteredWindowState as useRegisteredWindowStateImported } from "../../../../src/lib/context/global-window-registry-context.client";

vi.mock("../../../../src/components/ui/terminal/terminal-header", () => ({
  TerminalHeader: () => <div data-testid="mock-terminal-header" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/"),
}));

vi.mock("../../../../src/lib/context/global-window-registry-context.client", () => ({
  useRegisteredWindowState: vi.fn(),
}));

import { useRouter as useRouterImported } from "next/navigation";

const mockUseRegisteredWindowState = useRegisteredWindowStateImported as Mock;
const mockUseRouter = useRouterImported as Mock;

const renderTerminal = () => {
  return render(
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>,
  );
};

describe("Terminal Space Key Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRouter.mockReturnValue({ push: vi.fn() });
    mockUseRegisteredWindowState.mockReturnValue({
      windowState: "normal",
      close: vi.fn(),
      minimize: vi.fn(),
      maximize: vi.fn(),
      restore: vi.fn(),
    });
  });

  it("allows typing space when input is focused (does not prevent default)", () => {
    renderTerminal();
    const input = screen.getByRole("textbox");
    input.focus();

    const evt = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    window.dispatchEvent(evt);

    // Global keydown safeguard must NOT block space when input is focused
    expect(evt.defaultPrevented).toBe(false);
  });

  it("prevents space scrolling and focuses input when pressed on content area", () => {
    renderTerminal();
    const input = screen.getByRole("textbox");
    // Ensure input is not focused to simulate pressing space outside the input
    input.blur();
    expect(document.activeElement).not.toBe(input);

    const content = screen.getByLabelText("Terminal content area");
    // Trigger section-level keydown handler which should prevent scroll and focus input
    fireEvent.keyDown(content, { key: " " });

    expect(input).toHaveFocus();
  });
});
