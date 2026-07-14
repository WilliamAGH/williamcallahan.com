import type { ImageServiceOptions } from "@/types/image";

export const TWITTER_IMAGE_FORMATS = ["jpg", "jpeg", "png", "gif", "webp"] as const;

export const TWITTER_IMAGE_ROOT_POLICIES = [
  {
    root: "profile_images",
    type: "social-avatars/twitter",
    acceptsExtensionless: false,
  },
  {
    root: "ext_tw_video_thumb",
    type: "twitter-media",
    acceptsExtensionless: false,
  },
  { root: "media", type: "twitter-media", acceptsExtensionless: true },
] as const satisfies ReadonlyArray<{
  root: string;
  type: NonNullable<ImageServiceOptions["type"]>;
  acceptsExtensionless: boolean;
}>;

const extensionPathPattern = /^([A-Za-z0-9._\-/]+)\.([A-Za-z]+)$/;
const extensionlessPathPattern = /^[A-Za-z0-9_-]+$/;

function findTwitterImageFormat(value: string): (typeof TWITTER_IMAGE_FORMATS)[number] | undefined {
  const lowercaseValue = value.toLowerCase();
  return TWITTER_IMAGE_FORMATS.find((format) => format === lowercaseValue);
}

export function parseTwitterImagePath(path: string, format: string | null) {
  const separatorIndex = path.indexOf("/");
  if (separatorIndex <= 0) return null;

  const rootName = path.slice(0, separatorIndex);
  const rootPolicy = TWITTER_IMAGE_ROOT_POLICIES.find(({ root }) => root === rootName);
  if (rootPolicy === undefined) return null;

  let canonicalFormat: (typeof TWITTER_IMAGE_FORMATS)[number] | null = null;
  if (format !== null) {
    const acceptedFormat = findTwitterImageFormat(format);
    if (acceptedFormat === undefined) return null;
    canonicalFormat = acceptedFormat;
  }

  const relativePath = path.slice(separatorIndex + 1);
  const extensionMatch = extensionPathPattern.exec(relativePath);
  if (extensionMatch !== null) {
    const [, basename, extension] = extensionMatch;
    if (basename === undefined || extension === undefined) return null;

    const acceptedExtension = findTwitterImageFormat(extension);
    if (acceptedExtension === undefined) return null;

    return {
      path: `${rootPolicy.root}/${basename}.${acceptedExtension}`,
      format: canonicalFormat,
      type: rootPolicy.type,
    };
  }

  if (
    !rootPolicy.acceptsExtensionless ||
    canonicalFormat === null ||
    !extensionlessPathPattern.test(relativePath)
  ) {
    return null;
  }

  return { path, format: canonicalFormat, type: rootPolicy.type };
}
