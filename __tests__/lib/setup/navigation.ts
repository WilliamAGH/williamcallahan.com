// __tests__/lib/setup/navigation.ts

/**
 * Navigation Test Setup
 *
 * Provides test utilities for navigation components.
 * Uses App Router context for proper Next.js 14 compatibility.
 */

import { createElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { TerminalProvider } from "@/components/ui/terminal/terminalContext";
import { AppRouterProvider, mockRouter } from "./appRouter";
import type { ReactElement, ReactNode } from "react";

// Mock next-themes
jest.mock("next-themes", () => ({
    useTheme: jest.fn(() => ({
        theme: "light",
        setTheme: jest.fn(),
        systemTheme: "light"
    })),
    ThemeProvider: ({ children }: { children: ReactNode }) =>
        createElement("div", { "data-testid": "theme-provider" }, children)
}));

// Setup function for consistent test environment
export function setupNavigationTest() {
    jest.clearAllMocks();

    (useTheme as jest.Mock).mockImplementation(() => ({
        theme: "light",
        setTheme: jest.fn(),
        systemTheme: "light"
    }));
}

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
    pathname?: string;
}

function createWrapper(pathname: string = "/") {
    return function Wrapper({ children }: { children: ReactNode }) {
        return createElement(
            AppRouterProvider,
            { pathname, children: createElement("div", { "data-testid": "theme-provider" }, createElement(TerminalProvider, null, children)) } as any, // FIX TYPESCRIPT ERROR: Argument of type ... is not assignable to parameter of type 'Attributes & AppRouterProviderProps'. // FIX TYPESCRIPT ERROR: Property 'children' is missing in type '{ pathname: string; }' but required in type 'AppRouterProviderProps'.
        );
    };
}

export function renderWithProviders(
    ui: ReactElement,
    { pathname = "/", ...options }: CustomRenderOptions = {}
) {
    return render(ui, {
        wrapper: createWrapper(pathname) as any, // FIX TYPESCRIPT ERROR: Argument of type ... is not assignable to parameter of type 'RenderOptions<typeof globalThis>["wrapper"]'.
        ...options
    });
}

export { mockRouter };
