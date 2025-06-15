/**
 * Jest DOM Setup
 *
 * Custom setup for @testing-library/jest-dom to fix compatibility issues with Bun
 */

import "@testing-library/jest-dom";

// Define a strongly-typed helper for accessing the (optionally present) Jest helpers
type JestGlobal = typeof globalThis & {
  jest?: {
    expect?: {
      // eslint-disable-next-line @typescript-eslint/ban-types
      getState?: () => {
        utils?: {
          RECEIVED_COLOR?: (text: string) => string;
        };
      } & Record<string, unknown>;
    };
  };
};

// Cast once so we do not sprinkle explicit casts all over the file
const jestGlobal = globalThis as JestGlobal;

// Fix for Bun compatibility – override RECEIVED_COLOR function if it's missing
const originalReceived = jestGlobal.jest?.expect?.getState?.()?.utils?.RECEIVED_COLOR;

if (typeof originalReceived !== "function") {
  const utils = jestGlobal.jest?.expect?.getState?.()?.utils;

  if (utils) {
    utils.RECEIVED_COLOR = (text: string): string => text;
  }
}
