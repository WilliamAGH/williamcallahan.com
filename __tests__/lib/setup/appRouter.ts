/**
 * App Router Test Setup
 *
 * Provides test utilities for Next.js App Router components.
 * Must be used in conjunction with other test setup files.
 */

import { createElement } from "react";
import type { ReactNode } from "react";

// Import actual context (needed for proper typing)
import {
    AppRouterContext,
    LayoutRouterContext,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

interface RouterType {
    back: jest.Mock;
    forward: jest.Mock;
    push: jest.Mock;
    replace: jest.Mock;
    refresh: jest.Mock;
    prefetch: jest.Mock;
    route: string;
    pathname: string;
    query: Record<string, unknown>;
    asPath: string;
    basePath: string;
    defaultLocale: string;
    locale: string;
    locales: string[];
    isLocaleDomain: boolean;
    isReady: boolean;
    isFallback: boolean;
    isPreview: boolean;
    events: {
        on: jest.Mock;
        off: jest.Mock;
        emit: jest.Mock;
    };
}

// Mock router implementation
export const mockRouter: RouterType = {
    back: jest.fn(),
    forward: jest.fn(),
    push: jest.fn().mockImplementation(() => Promise.resolve(true)),
    replace: jest.fn().mockImplementation(() => Promise.resolve(true)),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    route: "/",
    pathname: "/",
    query: {},
    asPath: "/",
    basePath: "",
    defaultLocale: "en",
    locale: "en",
    locales: ["en"],
    isLocaleDomain: false,
    isReady: true,
    isFallback: false,
    isPreview: false,
    events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
    }
};

// Create App Router context value
const createAppRouterContextValue = (pathname = "/") => ({
    back: mockRouter.back,
    forward: mockRouter.forward,
    push: mockRouter.push,
    replace: mockRouter.replace,
    refresh: mockRouter.refresh,
    prefetch: mockRouter.prefetch,
    pathname,
    route: pathname,
    query: {},
    segments: [],
    params: {},
    isExternalUrl: false,
    navigateUrl: pathname,
    canonicalUrl: pathname,
    nextUrl: pathname,
    sync: true
});

// Create Layout Router context value
const createLayoutRouterContextValue = (pathname = "/") => ({
    childNodes: new Map(),
    tree: {
        children: new Map(),
        segment: "",
        parallel: undefined,
        cache: {
            status: "ready",
            data: null,
            subTreeData: null,
            parallelRoutes: new Map()
        }
    },
    url: pathname
});

// Mock next/navigation
jest.mock("next/navigation", () => ({
    useRouter: () => ({
        ...mockRouter,
        push: mockRouter.push,
        replace: mockRouter.replace,
        refresh: mockRouter.refresh,
        back: mockRouter.back,
        forward: mockRouter.forward,
        prefetch: mockRouter.prefetch,
        pathname: mockRouter.pathname
    }),
    usePathname: () => mockRouter.pathname,
    useSelectedLayoutSegment: () => null,
    useSelectedLayoutSegments: () => [],
}));

interface AppRouterProviderProps {
    children: ReactNode;
    pathname?: string;
}

// Provider component for App Router context
export function AppRouterProvider({ children, pathname = "/" }: AppRouterProviderProps) {
    const appRouterContext = createAppRouterContextValue(pathname);
    const layoutRouterContext = createLayoutRouterContextValue(pathname);

    return createElement(
        AppRouterContext.Provider,
        { value: appRouterContext as any },
        createElement(
            LayoutRouterContext.Provider,
            { value: layoutRouterContext as any },
            children
        )
    );
}

AppRouterProvider.displayName = 'AppRouterProvider';

// Reset router state between tests
export function resetRouter() {
    mockRouter.pathname = "/";
    mockRouter.route = "/";
    mockRouter.asPath = "/";
    mockRouter.push.mockReset().mockImplementation(() => Promise.resolve(true));
    mockRouter.replace.mockReset().mockImplementation(() => Promise.resolve(true));
    mockRouter.back.mockReset();
    mockRouter.forward.mockReset();
    mockRouter.refresh.mockReset();
    mockRouter.prefetch.mockReset();
    mockRouter.events.on.mockReset();
    mockRouter.events.off.mockReset();
    mockRouter.events.emit.mockReset();
}
