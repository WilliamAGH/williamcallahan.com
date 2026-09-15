import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { BLOG_RENDER_CANARIES } from "./blog-render-canaries";

if (process.platform === "darwin" && process.env.CODEX_SESSION_ID) {
  throw new Error(
    "Browser launch is blocked in the Codex macOS sandbox; use the GitHub verification browser job.",
  );
}

const baseURL = "http://127.0.0.1:3100";
const readinessURL = `${baseURL}/blog/${BLOG_RENDER_CANARIES[0].slug}`;

const e2eEnvironment = {
  __NEXT_PROCESSED_ENV: "true",
  DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:1/williamcallahan",
  DATABASE_CONNECT_TIMEOUT_SECONDS: "1",
  DATABASE_POOL_MAX: "1",
  DEPLOYMENT_ENV: "development",
  NEXT_PUBLIC_S3_CDN_URL: baseURL,
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "development",
  PATH: dirname(process.execPath),
  S3_ACCESS_KEY_ID: "e2e-access-key",
  S3_BUCKET: "e2e-bucket",
  S3_ENDPOINT: "http://127.0.0.1:1",
  S3_FORCE_WRITE: "false",
  S3_REGION: "us-east-1",
  S3_SECRET_ACCESS_KEY: "e2e-secret-key",
  S3_SERVER_URL: "http://127.0.0.1:1",
  USE_S3_SEARCH_INDEXES: "false",
  WATCHPACK_POLLING: "true",
} as const;

const testEnvironmentAssignments = Object.entries(e2eEnvironment)
  .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
  .join(" ");

export default defineConfig({
  testDir: resolve(import.meta.dirname, "../e2e"),
  workers: 1,
  outputDir: resolve(import.meta.dirname, "../tmp/playwright/test-results"),
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: resolve(import.meta.dirname, "../tmp/playwright/report") },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: [
      "/usr/bin/env -i",
      testEnvironmentAssignments,
      JSON.stringify(process.execPath),
      "./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3100",
    ].join(" "),
    cwd: resolve(import.meta.dirname, ".."),
    reuseExistingServer: false,
    timeout: 120_000,
    url: readinessURL,
  },
});
