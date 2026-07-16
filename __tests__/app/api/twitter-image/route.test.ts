import { NextRequest } from "next/server";
import { GET } from "@/app/api/twitter-image/[...path]/route";
import {
  TWITTER_IMAGE_FORMATS,
  TWITTER_IMAGE_ROOT_POLICIES,
} from "@/lib/image-handling/twitter-image-policy";
import { ImageFetchHttpError } from "@/lib/services/image/image-fetcher";

const { getImage } = vi.hoisted(() => ({ getImage: vi.fn() }));

vi.mock("@/lib/services/unified-image-service", () => ({
  getUnifiedImageService: () => ({ getImage }),
}));

const extensionlessRootPolicy = TWITTER_IMAGE_ROOT_POLICIES.find(
  ({ acceptsExtensionless }) => acceptsExtensionless,
);
if (extensionlessRootPolicy === undefined) {
  throw new Error("Twitter image policy requires an extensionless root");
}
const extensionlessPath = `${extensionlessRootPolicy.root}/GrfJDHibgAAIQ3o`;

function requestTwitterImage(path: string, query: string) {
  const suffix = query.length === 0 ? "" : `?${query}`;
  const request = new NextRequest(`https://williamcallahan.com/api/twitter-image/${path}${suffix}`);
  return GET(request, { params: Promise.resolve({ path: path.split("/") }) });
}

describe("Twitter image route", () => {
  beforeEach(() => {
    getImage.mockReset();
    getImage.mockResolvedValue({
      buffer: Buffer.from([1]),
      contentType: "image/jpeg",
      source: "network",
    });
  });

  it.each(TWITTER_IMAGE_FORMATS)(
    "forwards extensionless media with the canonical %s format",
    async (format) => {
      const response = await requestTwitterImage(
        extensionlessPath,
        `format=${format}&name=large&dpl=release-123`,
      );

      expect(response.status).toBe(200);
      expect(getImage).toHaveBeenCalledWith(
        `https://pbs.twimg.com/${extensionlessPath}?format=${format}&name=large`,
        { type: extensionlessRootPolicy.type },
      );
    },
  );

  it.each(TWITTER_IMAGE_ROOT_POLICIES)(
    "categorizes extension-bearing $root paths from the canonical root policy",
    async ({ root, type }) => {
      const response = await requestTwitterImage(`${root}/folder/image.JpG`, "");

      expect(response.status).toBe(200);
      expect(getImage).toHaveBeenCalledWith(`https://pbs.twimg.com/${root}/folder/image.jpg`, {
        type,
      });
    },
  );

  it("normalizes a mixed-case query format before forwarding", async () => {
    const response = await requestTwitterImage(extensionlessPath, "format=JpG");

    expect(response.status).toBe(200);
    expect(getImage).toHaveBeenCalledWith(`https://pbs.twimg.com/${extensionlessPath}?format=jpg`, {
      type: extensionlessRootPolicy.type,
    });
  });

  it.each(["", "svg"])("rejects the invalid format %j", async (format) => {
    const response = await requestTwitterImage(extensionlessPath, `format=${format}`);

    expect(response.status).toBe(400);
    expect(getImage).not.toHaveBeenCalled();
  });

  it.each([
    extensionlessRootPolicy.root.toUpperCase(),
    extensionlessRootPolicy.root.replace(/^./, (character) => character.toUpperCase()),
  ])("rejects the noncanonical root %s", async (root) => {
    const response = await requestTwitterImage(`${root}/GrfJDHibgAAIQ3o`, "format=jpg");

    expect(response.status).toBe(400);
    expect(getImage).not.toHaveBeenCalled();
  });

  it("returns a quiet 404 when the upstream image is missing", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    getImage.mockRejectedValueOnce(new ImageFetchHttpError(404, "Not Found"));

    try {
      const response = await requestTwitterImage(extensionlessPath, "format=jpg");

      expect(response.status).toBe(404);
      expect(info).toHaveBeenCalledWith("[Twitter Image Proxy] Upstream image not found");
    } finally {
      info.mockRestore();
    }
  });
});
