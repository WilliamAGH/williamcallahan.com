import type { Mock } from "vitest";
import React from "react"; // Ensure React is imported first
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import { Terminal } from "../../../../src/components/ui/terminal/terminal-implementation.client";
import { TerminalProvider } from "../../../../src/components/ui/terminal/terminal-context.client";
import { useTerminal } from "../../../../src/components/ui/terminal/use-terminal.client";
import { useRegisteredWindowState as useRegisteredWindowStateImported } from "../../../../src/lib/context/global-window-registry-context.client";
import { handleCommand as handleCommandImported } from "../../../../src/components/ui/terminal/commands.client";
import { aiChat as aiChatImported } from "../../../../src/lib/ai/openai-compatible/browser-client";
import type { CommandResult } from "../../../../src/types/terminal";

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

vi.mock("../../../../src/components/ui/terminal/commands.client", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../src/components/ui/terminal/commands.client")
  >("../../../../src/components/ui/terminal/commands.client");
  return {
    ...actual,
    handleCommand: vi.fn(),
    preloadSearch: vi.fn(),
  };
});

vi.mock("../../../../src/lib/ai/openai-compatible/browser-client", () => ({
  aiChat: vi.fn(),
}));

import { useRouter as useRouterImported } from "next/navigation";

const mockUseRegisteredWindowState = useRegisteredWindowStateImported as Mock;
const mockUseRouter = useRouterImported as Mock;
const mockHandleCommand = handleCommandImported as Mock;
const mockAiChat = aiChatImported as Mock;

class Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void = () => {
    throw new Error("Deferred resolve called before initialization");
  };
  reject: (reason?: unknown) => void = () => {
    throw new Error("Deferred reject called before initialization");
  };

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

const createDeferred = <T,>(): Deferred<T> => new Deferred<T>();

const createAbortableCommand = () => {
  const deferred = createDeferred<CommandResult>();
  const handler = (_input: string, signal?: AbortSignal) => {
    if (signal) {
      if (signal.aborted) {
        deferred.reject(new DOMException("Aborted", "AbortError"));
      } else {
        signal.addEventListener(
          "abort",
          () => {
            deferred.reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    }
    return deferred.promise;
  };
  return { deferred, handler };
};

const createAbortableAiChat = () => {
  const deferred = createDeferred<string>();
  const handler = (_feature: string, _payload: unknown, options?: { signal?: AbortSignal }) => {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted) {
        deferred.reject(new DOMException("Aborted", "AbortError"));
      } else {
        signal.addEventListener(
          "abort",
          () => {
            deferred.reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    }
    return deferred.promise;
  };
  return { deferred, handler };
};

const renderTerminal = () => {
  return render(
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>,
  );
};

describe("Concurrent Command Prevention", () => {
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

  it("disables input during command processing", async () => {
    const { deferred, handler } = createAbortableCommand();
    mockHandleCommand.mockImplementationOnce(handler);

    renderTerminal();
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "blog test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    expect(mockHandleCommand).toHaveBeenCalledTimes(1);
    expect(mockHandleCommand).toHaveBeenCalledWith("blog test", expect.any(AbortSignal));

    deferred.resolve({ results: [] });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });
  });

  it("prevents multiple concurrent submissions", async () => {
    const { deferred, handler } = createAbortableCommand();
    mockHandleCommand.mockImplementationOnce(handler);

    renderTerminal();
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "blog test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(mockHandleCommand).toHaveBeenCalledTimes(1);

    deferred.resolve({ results: [] });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });
  });
});

describe("AbortController Cleanup", () => {
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

  it("aborts in-flight requests when component unmounts", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const { deferred, handler } = createAbortableCommand();
    mockHandleCommand.mockImplementationOnce(handler);

    const { unmount } = renderTerminal();
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "blog test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    unmount();

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalledWith("unmount");
    });

    abortSpy.mockRestore();
    deferred.resolve({ results: [] });
  });

  it("aborts the previous request when a new request is initiated", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const first = createAbortableAiChat();
    const second = createAbortableAiChat();
    mockAiChat.mockImplementationOnce(first.handler).mockImplementationOnce(second.handler);

    let firstPromise: Promise<void> | null = null;
    let secondPromise: Promise<void> | null = null;

    const { result } = renderHook(() => useTerminal(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <TerminalProvider>{children}</TerminalProvider>
      ),
    });

    act(() => {
      firstPromise = result.current.sendChatMessage("First request");
      secondPromise = result.current.sendChatMessage("Second request");
    });

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalledWith("superseded");
    });

    await act(async () => {
      second.deferred.resolve("Second response");
      if (firstPromise && secondPromise) {
        await Promise.all([firstPromise, secondPromise]);
      }
    });

    abortSpy.mockRestore();
  });
});
