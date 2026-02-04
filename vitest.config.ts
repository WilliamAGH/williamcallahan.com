import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // Critical: Subpath mocks MUST come before their parent modules
      "next-mdx-remote/serialize": resolve(
        rootDir,
        "__tests__/__mocks__/lib/next-mdx-remote-serialize.ts",
      ),
      // Next.js internal mocks (manual replacement for next/jest)
      "next/navigation": resolve(rootDir, "__tests__/__mocks__/next/navigation.ts"),
      "next/image": resolve(rootDir, "__tests__/__mocks__/next/image.ts"),
      "next/server": resolve(rootDir, "__tests__/__mocks__/next/server.ts"),
      "next/cache": resolve(rootDir, "__tests__/__mocks__/next/cache.ts"),
      "next-themes": resolve(rootDir, "__tests__/__mocks__/next-themes.ts"),
      "@sentry/nextjs": resolve(rootDir, "__tests__/__mocks__/sentry.ts"),
      "@clerk/nextjs": resolve(rootDir, "__tests__/__mocks__/@clerk/nextjs.ts"),
      "@clerk/nextjs/server": resolve(rootDir, "__tests__/__mocks__/@clerk/nextjs-server.ts"),
      // Lib mocks
      cheerio: resolve(rootDir, "__tests__/__mocks__/lib/cheerio.ts"),
      "next-mdx-remote": resolve(rootDir, "__tests__/__mocks__/lib/next-mdx-remote.ts"),
      plaiceholder: resolve(rootDir, "__tests__/__mocks__/lib/plaiceholder.ts"),
      "@/lib/data-access/github": resolve(rootDir, "__tests__/__mocks__/lib/data-access/github.ts"),
      "@/lib/utils/ensure-server-only": resolve(
        rootDir,
        "__tests__/__mocks__/lib/utils/ensure-server-only.ts",
      ),
      // NOTE: @/lib/bookmarks/bookmarks-data-access.server is NOT aliased here.
      // Tests that need a mock should use vi.mock() explicitly.
      // This follows KISS and makes test intent explicit.
      // Server-only mock (to prevent crashes in jsdom)
      "server-only": resolve(rootDir, "__tests__/__mocks__/empty.ts"),
      "next/font/google": resolve(rootDir, "__tests__/__mocks__/next/font.ts"),
      "next/font/local": resolve(rootDir, "__tests__/__mocks__/next/font.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [
      "./config/vitest/env-setup.ts",
      "./config/vitest/global-mocks.ts",
      "./config/vitest/setup.ts",
    ],
    include: ["**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/src/types/test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["config/**", "**/*.d.ts", "**/*.config.*", "**/__tests__/**", "**/types/**"],
    },
    // Vitest 4 flat config (replaces nested poolOptions)
    // isolate: true is default and matches Jest's behavior (clean context per file)
    // isolate: false was causing singleton state leaks in chroma/client.test.ts
    // isolate: false, // REMOVED to restore isolation
    maxWorkers: 1,
    clearMocks: true,
    testTimeout: 20000,
  },
});
