import { withSentryConfig } from "@sentry/nextjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import packageJson from "./package.json" with { type: "json" };
import { parseS3Endpoint } from "./src/types/schemas/s3-config";

const VALID_DEPLOYMENT_ID = /^[A-Za-z0-9_-]+$/;

function requireUrlSafeReleaseId(value: string, source: string): string {
  if (!VALID_DEPLOYMENT_ID.test(value)) {
    throw new Error(
      `[next.config] ${source} may contain only letters, numbers, hyphens, and underscores.`,
    );
  }
  return value;
}

function resolveProductionReleaseId(phase: string): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  const deploymentId = process.env.NEXT_DEPLOYMENT_ID?.trim();
  if (deploymentId) return requireUrlSafeReleaseId(deploymentId, "NEXT_DEPLOYMENT_ID");

  let gitError: unknown;
  try {
    const gitHead = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const releaseId = requireUrlSafeReleaseId(gitHead, "local git HEAD");
    console.warn("[next.config] NEXT_DEPLOYMENT_ID is unset; using local git HEAD.");
    return releaseId;
  } catch (error) {
    gitError = error;
  }

  if (phase !== PHASE_PRODUCTION_SERVER) {
    throw new Error(
      "[next.config] Production builds require a URL-safe NEXT_DEPLOYMENT_ID or local git HEAD.",
      { cause: gitError },
    );
  }

  try {
    const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
    const releaseId = requireUrlSafeReleaseId(buildId, "existing .next/BUILD_ID");
    console.warn("[next.config] Reusing the existing .next/BUILD_ID for production startup.");
    return releaseId;
  } catch (buildIdError: unknown) {
    const gitMessage = gitError instanceof Error ? gitError.message : String(gitError);
    const buildIdMessage =
      buildIdError instanceof Error ? buildIdError.message : String(buildIdError);
    throw new Error(
      `[next.config] Production requires NEXT_DEPLOYMENT_ID, local git HEAD, or an existing .next/BUILD_ID. Git failed: ${gitMessage}. BUILD_ID failed: ${buildIdMessage}.`,
      { cause: buildIdError },
    );
  }
}

process.env.NEXT_PUBLIC_APP_VERSION = packageJson.version;
function applyReleaseEnvironment(releaseId: string | null): void {
  if (releaseId) {
    // Next 16 reads this value for `?dpl=`; generateBuildId uses the same identity.
    process.env.NEXT_DEPLOYMENT_ID = releaseId;
    process.env.NEXT_PUBLIC_GIT_HASH = releaseId;
    process.env.SENTRY_RELEASE = releaseId;
  }
}

const telemetryBundledPackages = [
  "resolve",
  "require-in-the-middle",
  "@opentelemetry/api",
  "@opentelemetry/instrumentation",
  "@opentelemetry/context-async-hooks",
];
const baseTranspilePackages =
  process.env.NODE_ENV === "production" ? ["next-mdx-remote", "swr"] : [];
const transpilePackages = Array.from(
  new Set([...baseTranspilePackages, ...telemetryBundledPackages]),
);

const CALLAHAN_IMAGE_HOSTS = [
  "s3-storage.callahan.cloud",
  "williamcallahan.com",
  "dev.williamcallahan.com",
  "alpha.williamcallahan.com",
  "*.williamcallahan.com",
  "*.callahan.cloud",
  "*.digitaloceanspaces.com",
  "*.sfo3.digitaloceanspaces.com",
];

function buildRemotePattern(url: URL, hostnamePrefix = ""): RemotePattern {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("[next.config] Image CDN URLs must use HTTP or HTTPS.");
  }
  const protocol = url.protocol === "http:" ? "http" : "https";
  return {
    protocol,
    hostname: `${hostnamePrefix}${url.hostname}`,
    ...(url.port ? { port: url.port } : {}),
    pathname: "/**",
  };
}

function buildHttpsRemotePattern(hostname: string): RemotePattern {
  return { protocol: "https", hostname, pathname: "/**" };
}

function parsePublicCdnRemotePattern(value?: string | null) {
  if (!value?.trim()) return null;
  return buildRemotePattern(new URL(value.trim()));
}

function buildBucketRemotePattern() {
  const bucket = process.env.S3_BUCKET?.trim();
  const serverUrl = parseS3Endpoint(process.env.S3_SERVER_URL);
  if (!bucket || !serverUrl) return null;
  return buildRemotePattern(new URL(serverUrl), `${bucket}.`);
}

const CDN_REMOTE_PATTERNS = [
  ...CALLAHAN_IMAGE_HOSTS.map(buildHttpsRemotePattern),
  parsePublicCdnRemotePattern(process.env.NEXT_PUBLIC_S3_CDN_URL),
  buildBucketRemotePattern(),
].filter((pattern) => pattern !== null);

function resolveStaticGenerationMaxConcurrency(): number {
  const raw = process.env.STATIC_GEN_CONCURRENCY;
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 16) return parsed;

  try {
    return os.cpus().length >= 2 ? 2 : 1;
  } catch (error) {
    console.warn(
      "[next.config] Could not determine CPU count; using one static generation worker.",
      error,
    );
    return 1;
  }
}

function createNextConfig(releaseId: string | null) {
  return {
    typescript: { ignoreBuildErrors: true },
    outputFileTracingIncludes: { "/": ["./data/**/*"] },
    turbopack: {
      rules: { "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" } },
      resolveExtensions: [".mdx", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
      resolveAlias: {
        swr$: "./node_modules/swr/dist/index/index.js",
        "swr/infinite": "./node_modules/swr/infinite/dist/index.js",
        "swr/_internal": "./node_modules/swr/_internal/dist/index.js",
        "hoist-non-react-statics$":
          "./node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js",
        "@opentelemetry/api": {
          browser: "./src/lib/edge-polyfills/opentelemetry.ts",
          edge: "./src/lib/edge-polyfills/opentelemetry.ts",
        },
        ...(process.env.NODE_ENV === "development" && process.env.S3_FORCE_WRITE !== "true"
          ? { "@aws-sdk/client-s3": "./src/lib/stubs/aws-s3-stub.ts" }
          : {}),
      },
    },
    transpilePackages,
    async redirects() {
      return [
        {
          source: "/bookmarks/page/:pageNumber(\\d+)",
          destination: "/bookmarks",
          permanent: true,
        },
      ];
    },
    // `null` delegates development build IDs to Next; production always has releaseId.
    generateBuildId: async () => releaseId,
    poweredByHeader: false,
    reactStrictMode: true,
    productionBrowserSourceMaps: false,
    cacheComponents: true,
    serverExternalPackages: ["@chroma-core/default-embed", "chromadb"],
    experimental: {
      taint: true,
      serverMinification: process.env.NODE_ENV === "production",
      proxyClientMaxBodySize: "100mb",
      serverActions: { bodySizeLimit: "100mb" },
      preloadEntriesOnStart: false,
      serverSourceMaps: false,
      optimizePackageImports:
        process.env.NODE_ENV === "production" ? ["lucide-react", "@sentry/nextjs"] : [],
      optimizeCss: true,
      staticGenerationMaxConcurrency: resolveStaticGenerationMaxConcurrency(),
      optimizeServerReact: true,
    },
    images: {
      dangerouslyAllowSVG: true,
      contentDispositionType: "inline",
      formats: ["image/webp", "image/avif"],
      qualities: [75, 80, 85, 90, 100],
      minimumCacheTTL: 60 * 60 * 24 * 30,
      path: "/_next/image",
      localPatterns: [
        { pathname: "/images/**" },
        { pathname: "/api/assets/**" },
        { pathname: "/api/cache/images" },
        { pathname: "/api/books/cover/**" },
        { pathname: "/api/logo" },
        { pathname: "/api/logo/invert" },
        { pathname: "/api/og-image" },
      ],
      remotePatterns: [
        ...CDN_REMOTE_PATTERNS,
        { protocol: "https", hostname: "cdn.discordapp.com" },
        { protocol: "https", hostname: "media.discordapp.net" },
        { protocol: "https", hostname: "avatars.githubusercontent.com" },
        { protocol: "https", hostname: "github.githubassets.com" },
        { protocol: "https", hostname: "raw.githubusercontent.com" },
        { protocol: "https", hostname: "pbs.twimg.com" },
        { protocol: "https", hostname: "abs.twimg.com" },
        { protocol: "https", hostname: "media.licdn.com" },
        { protocol: "https", hostname: "static.licdn.com" },
        { protocol: "https", hostname: "cdn.bsky.app" },
        { protocol: "https", hostname: "cdn.bsky.social" },
        { protocol: "https", hostname: "images.unsplash.com" },
        { protocol: "https", hostname: "icons.duckduckgo.com" },
        { protocol: "https", hostname: "www.google.com" },
        { protocol: "https", hostname: "external-content.duckduckgo.com" },
        { protocol: "https", hostname: "plausible.iocloudhost.net" },
        { protocol: "https", hostname: "*.iocloudhost.net" },
        { protocol: "https", hostname: "*.popos-sf1.com" },
        { protocol: "https", hostname: "*.popos-sf2.com" },
        { protocol: "https", hostname: "*.popos-sf3.com" },
        { protocol: "https", hostname: "*.popos-sf4.com" },
        { protocol: "https", hostname: "*.popos-sf5.com" },
        { protocol: "https", hostname: "*.popos-sf6.com" },
        { protocol: "https", hostname: "*.popos-sf7.com" },
      ],
      deviceSizes: [640, 750, 800, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [48, 64, 96, 128, 256, 384],
    },
    ...(process.env.NODE_ENV === "production" ? { cacheMaxMemorySize: 0 } : {}),
    staticPageGenerationTimeout: 300,
  };
}

function createSentryWebpackPluginOptions(releaseId: string | null) {
  return {
    silent: true,
    org: "williamcallahan-com",
    project: "williamcallahan-com",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    useRunAfterProductionCompileHook: false,
    applicationKey: "williamcallahan-com",
    ...(releaseId ? { release: { name: releaseId, deploy: { env: process.env.NODE_ENV } } } : {}),
    dryRun: process.env.NODE_ENV === "development",
    ...(process.env.NODE_ENV === "development"
      ? { sourcemaps: { disable: true } }
      : {
          widenClientFileUpload: true,
          sourcemaps: {
            assets: ["./**/*.js", "./**/*.js.map"],
            ignore: ["./node_modules/**"],
            filesToDeleteAfterUpload: ["./**/*.js.map"],
          },
        }),
  };
}

export default function configureNext(phase: string) {
  const releaseId = resolveProductionReleaseId(phase);
  applyReleaseEnvironment(releaseId);
  return withSentryConfig(createNextConfig(releaseId), createSentryWebpackPluginOptions(releaseId));
}
