import { render, act } from "@testing-library/react";
import { FolderKanban } from "lucide-react";
import {
  GlobalWindowRegistryProvider,
  useWindowRegistry,
  useRegisteredWindowState,
} from "../../src/lib/context/global-window-registry-context.client";

describe("useRegisteredWindowState", () => {
  it("registers on mount, unregisters on unmount, and toggles isRegistered", async () => {
    let registerSpy!: jest.SpyInstance;
    let unregisterSpy!: jest.SpyInstance;

    /**
     * Helper component to expose the context so we can attach spies.
     * This renders once (children are inside the same provider) and captures
     * stable references to registerWindow/unregisterWindow.
     */
    const SpyCollector = () => {
      const ctx = useWindowRegistry();
      if (!registerSpy) {
        registerSpy = jest.spyOn(ctx, "registerWindow");
        unregisterSpy = jest.spyOn(ctx, "unregisterWindow");
      }
      return null;
    };

    const TestComponent = () => {
      const { isRegistered } = useRegisteredWindowState("test-win", FolderKanban, "Test", "normal");
      return <div data-testid="status">{isRegistered ? "registered" : "pending"}</div>;
    };

    const { unmount, getByTestId } = render(
      <GlobalWindowRegistryProvider>
        <SpyCollector />
        <TestComponent />
      </GlobalWindowRegistryProvider>,
    );

    // let effects flush
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(getByTestId("status").textContent).toBe("registered");

    unmount();

    expect(unregisterSpy).toHaveBeenCalledTimes(1);
  });
});
