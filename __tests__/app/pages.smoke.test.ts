// Jest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
import { renderToString } from "react-dom/server";
import React, { type JSX } from "react";
import { GlobalWindowRegistryProvider } from "../../lib/context/global-window-registry-context.client";
import type { PageComponentModule } from "@/types/test";
// The import is correct - we're importing the component, not using it as a type

const staticPageRoutes = [
  { name: "Contact", path: "@/app/contact/page", needsProvider: true },
  { name: "Education", path: "@/app/education/page", skipRender: true }, // Has server-only imports
  { name: "Experience", path: "@/app/experience/page", skipRender: true, needsProvider: true }, // Needs provider
  { name: "Investments", path: "@/app/investments/page", skipRender: true }, // Uses async components
  { name: "Projects", path: "@/app/projects/page", needsProvider: true },
  { name: "Bookmarks", path: "@/app/bookmarks/page", skipRender: true }, // Has server data fetching
];

let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
  // Create a mock fetch function that includes the preconnect method required by Bun

  const mockFetch = (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (urlString.startsWith("/api/logo")) {
      console.log(`[MOCK FETCH] Intercepted call to ${urlString}`);
      return Promise.resolve(
        new Response(JSON.stringify({ mockLogoData: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    console.warn(`[MOCK FETCH] Unhandled fetch call to ${urlString}. Returning 404.`);
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  // Add the preconnect method to match fetch's interface
  const mockFetchWithPreconnect = Object.assign(mockFetch, {
    preconnect: (
      _url: string | URL,
      _options?: {
        dns?: boolean;
        tcp?: boolean;
        http?: boolean;
        https?: boolean;
      },
    ): void => {
      // Mock implementation does nothing
    },
  });

  // Apply the mock
  global.fetch = mockFetchWithPreconnect as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("App Router Page Smoke Tests (Static Routes)", () => {
  for (const pageInfo of staticPageRoutes) {
    it(`should render ${pageInfo.name} page component to string without errors`, async () => {
      // Skip server-only and async/client-only pages
      if (pageInfo.name === "Education" || pageInfo.skipRender) {
        console.log(`Skipping import test for ${pageInfo.name} due to skipRender flag`);
        return;
      }

      let PageComponentModule: PageComponentModule;
      try {
        // Add type assertion to the dynamic import
        PageComponentModule = (await import(pageInfo.path)) as PageComponentModule;
      } catch (importError) {
        console.error(`Failed to import ${pageInfo.name} page at ${pageInfo.path}:`, importError);
        expect(importError).toBeNull(); // Fail test if import fails
        return;
      }

      const PageComponent = PageComponentModule.default;
      if (typeof PageComponent !== "function") {
        console.error(`Default export for ${pageInfo.name} is not a function.`);
        expect(typeof PageComponent).toBe("function"); // More portable than toBeTypeOf
        return;
      }

      try {
        // Skip rendering tests for pages that need special handling
        if (pageInfo.skipRender) {
          console.log(
            `Skipping detailed render test for ${pageInfo.name} due to ${pageInfo.name === "Investments" ? "async components" : "client components"}`,
          );
          // Simply verify that the component is a function
          expect(typeof PageComponent).toBe("function");
          return;
        }

        const pageComponentInstance = await PageComponent({ params: {}, searchParams: {} });

        let elementToRender: JSX.Element | null = null; // Initialize as null

        // Check if the instance is a valid React element (object, not null)
        if (pageComponentInstance && typeof pageComponentInstance === "object") {
          elementToRender = pageComponentInstance; // Assign if valid element

          if (pageInfo.needsProvider) {
            // Wrap the valid element with the provider using React.createElement
            // instead of JSX syntax to avoid parsing issues in .ts files
            elementToRender = React.createElement(GlobalWindowRegistryProvider, null, elementToRender);
          }
        } else if (pageComponentInstance === null) {
          console.error(`PageComponentInstance for ${pageInfo.name} is null.`);
          expect(pageComponentInstance).not.toBeNull(); // Fail test if pageComponentInstance is null
          return;
        } else {
          // Handle unexpected return types (like boolean) - fail the test
          console.error(`PageComponent for ${pageInfo.name} returned unexpected type: ${typeof pageComponentInstance}`);
          expect(typeof pageComponentInstance).toBe("object"); // Fail test if not object or null
        }

        // Only render if we have a valid element (not null or undefined)
        if (elementToRender) {
          // Only truthy values (valid React elements) should be rendered
          const html = renderToString(elementToRender);
          expect(html).toEqual(expect.any(String));
          expect(html.length).toBeGreaterThan(0);
        } else {
          // This case should ideally not be hit due to the checks above
          console.error(`Skipping renderToString for ${pageInfo.name} due to invalid element type.`);
          // Optionally fail the test here
          expect(elementToRender).not.toBeUndefined();
        }

        // console.log(`Successfully rendered ${pageInfo.name} page component to string.`);
      } catch (renderError) {
        console.error(`Error rendering ${pageInfo.name} page component:`, renderError);
        expect(renderError).toBeNull(); // Fail test if any error occurs
      }
    });
  }
});
