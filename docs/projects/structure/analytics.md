# Analytics Component Tests (`__tests__/components/analytics/Analytics.test.tsx`)

This file contains tests for the `Analytics` client component, which is responsible for integrating Umami and Plausible analytics into the application.

## Key Functionalities Tested

1. **Script Initialization**: Verifies that the Umami and Plausible analytics scripts are correctly loaded and initialized. This is achieved by mocking `next/script` and simulating the script loading process, including the creation of global `umami` and `plausible` objects.
2. **Path Handling**: Ensures that the component correctly handles different URL paths, including regular pages and blog post paths. The `usePathname` hook from `next/navigation` is mocked to simulate different routes.
3. **Environment Variable Dependency**: Checks that the analytics scripts are not initialized if the required environment variables (`NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `NEXT_PUBLIC_SITE_URL`) are missing.
4. **Page View Tracking on Route Change**: Tests that page views are tracked correctly when the route changes. This involves re-rendering the component with a new path and verifying that the `umami.track` function is called with the updated path information.

## Mocks Used

* `next/navigation`: The `usePathname` hook is mocked to control the current path in tests.
* `next/script`: The `Script` component is mocked to simulate script loading and initialization behavior for Umami and Plausible. This mock handles `onLoad` and `onError` callbacks and sets up the global `umami` and `plausible` objects.

## Test Structure

* The tests are organized within a `describe.skip` block, indicating they are currently skipped in the test suite.
* `beforeEach` and `afterEach` hooks are used to set up and tear down test conditions, including:
  * Setting up mock environment variables.
  * Mocking `usePathname`.
  * Resetting mock script loading states and global analytics objects.
  * Using fake timers (`jest.useFakeTimers()`).
  * Mocking `console` methods (`debug`, `error`, `warn`).

## Notable Test Cases

* `initializes analytics scripts correctly`: Checks if Umami and Plausible are defined globally and if `umami.track` is called after simulated script loading.
* `handles blog post paths correctly`: Verifies component rendering for blog post paths (though the component itself renders `null` due to the `next/script` mock).
* `does not initialize without required environment variables`: Ensures no scripts are rendered if essential environment variables are missing.
* `tracks page views on route changes`: Simulates a route change and verifies that `umami.track` is called with the new path.

## Potential Issues/Observations

* The entire test suite for this component is currently skipped (`describe.skip`).
* The tests rely heavily on Jest's mocking capabilities, particularly for `next/script` and `next/navigation`.
* The mock for `next/script` uses `setTimeout` to simulate asynchronous script loading, and tests use `jest.advanceTimersByTime` and `waitFor` to manage these asynchronous operations.

## Overview

The analytics system is responsible for loading and managing third-party tracking scripts (Plausible, Umami, Clicky) in a safe, non-blocking, and privacy-conscious manner. The entire implementation is client-side and is designed to be resilient to script-loading failures.

## Core Components

* **`components/analytics/analytics.client.tsx`**: The primary component that contains all logic for script injection, event tracking, and error handling.
* **`types/analytics.d.ts`**: Provides TypeScript definitions for the global `window` object, adding types for the third-party analytics libraries to ensure type safety.

## Logic Flow & Key Features

1. **Environment Check**:
    * The `Analytics` component first checks the environment. It will not load any scripts if the app is running on `localhost` in development mode or if crucial environment variables (e.g., `NEXT_PUBLIC_UMAMI_WEBSITE_ID`) are missing.

2. **Error Boundary**:
    * The entire component is wrapped in a custom `AnalyticsErrorBoundary`. If any of the analytics scripts throw an error during rendering or execution, this boundary will catch it and silently fail, preventing the main application from crashing.

3. **Script Injection**:
    * It uses the Next.js `<Script>` component to asynchronously load the analytics libraries from their respective CDNs.
    * `onLoad` callbacks on the `<Script>` components are used to track which scripts have successfully loaded.

4. **Pageview Tracking**:
    * It uses the `usePathname` hook from `next/navigation` to detect route changes.
    * An `useEffect` hook triggers a `trackPageview` function whenever the `pathname` changes.
    * Before being sent to the analytics services, dynamic paths (like `/blog/[slug]`) are normalized to aggregate data correctly (e.g., to `/blog/:slug`).

5. **Defensive API Calls**:
    * All calls to the third-party analytics functions (`window.plausible`, `window.umami`, etc.) are wrapped in `try...catch` blocks. This ensures that if a script loaded but its API is unavailable or fails, it will not disrupt the application.

## Data Structures

* **`UmamiEvent` / `PlausibleEvent`**: Interfaces that define the structure of the data sent with custom events, ensuring consistency.
* **`Window` Augmentation**: The `global.d.ts` file extends the standard `Window` interface to include the analytics library objects, enabling static type checking.

This architecture ensures that analytics are a non-critical, resilient feature that can be safely disabled or fail without impacting the core user experience.
