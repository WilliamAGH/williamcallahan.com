// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { putObject } from "@/lib/s3/objects";

vi.mock("@/lib/s3/objects", () => ({ putObject: vi.fn<typeof putObject>() }));
vi.mock("@/lib/utils/logger", () => ({
  default: { info: vi.fn<(message: string, ...args: unknown[]) => void>() },
}));

let buildRoot: string;

beforeEach(async () => {
  vi.resetModules();
  buildRoot = await mkdtemp(path.join(os.tmpdir(), "static-archive-"));
  vi.spyOn(process, "cwd").mockReturnValue(buildRoot);
  vi.stubEnv("NEXT_PUBLIC_S3_CDN_URL", "https://archive.example.test");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(buildRoot, { recursive: true, force: true });
});

async function buildFile(relativePath: string, bytes: Buffer): Promise<void> {
  const filename = path.join(buildRoot, ".next", relativePath);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, bytes);
}

it("publishes chunks, images and fonts at their original immutable keys without changing bytes", async () => {
  const assets = [
    { file: "chunks/app/a1b2.js", type: "application/javascript; charset=UTF-8" },
    { file: "chunks/a1b2.css", type: "text/css; charset=UTF-8" },
    { file: "media/portrait.a1b2.png", type: "image/png" },
    { file: "media/portrait.a1b2.avif", type: "image/avif" },
    { file: "media/inter.a1b2.woff2", type: "font/woff2" },
    { file: "media/mono.a1b2.woff", type: "font/woff" },
  ];
  // The controlled S3 boundary records actual writes from the publisher, not its predicate.
  const objects = new Map<string, { bytes: Buffer; type?: string; cache?: string; acl?: string }>();
  vi.mocked(putObject).mockImplementation(async (key, data, options) => {
    if (!Buffer.isBuffer(data)) throw new Error("Expected build-file bytes");
    objects.set(key, {
      bytes: Buffer.from(data),
      type: options?.contentType,
      cache: options?.cacheControl,
      acl: options?.acl,
    });
    return {};
  });
  for (const [index, asset] of assets.entries()) {
    await buildFile(`static/${asset.file}`, Buffer.from([0, 255, index, 128, 10]));
  }

  await import("../../scripts/archive-static-assets");

  expect([...objects.keys()].toSorted()).toEqual(
    assets.map((asset) => `_next/static/${asset.file}`).toSorted(),
  );
  for (const [index, asset] of assets.entries()) {
    expect(objects.get(`_next/static/${asset.file}`)).toEqual({
      bytes: Buffer.from([0, 255, index, 128, 10]),
      type: asset.type,
      cache: "public, max-age=31536000, immutable",
      acl: "public-read",
    });
  }
});

it("excludes source maps, unsupported extensions and private build output before any S3 write", async () => {
  const writtenKeys: string[] = [];
  vi.mocked(putObject).mockImplementation(async (key) => {
    writtenKeys.push(key);
    return {};
  });
  for (const file of [
    "static/chunks/public.js",
    "static/chunks/public.js.map",
    "static/chunks/sourcemaps/source.js",
    "static/chunks/.private.js",
    "static/chunks/secret.json",
    "static/media/font.woff2.map",
    "static/media/code.js",
    "static/media/.private.png",
    "static/server/private.js",
    "static/build-id/_buildManifest.js",
    "server/app/private.js",
    "cache/private.png",
  ]) {
    await buildFile(file, Buffer.from("fixture"));
  }

  await import("../../scripts/archive-static-assets");

  expect(writtenKeys).toEqual(["_next/static/chunks/public.js"]);
});
