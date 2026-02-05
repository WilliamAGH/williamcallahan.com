"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useState, type JSX } from "react";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
/**
 * @file TweetEmbed component and related image proxy utilities.
 * This file provides a component to embed tweets using `react-tweet`
 * and includes an image proxy to serve Twitter images from the same origin,
 * with optimizations for image versions.
 */

// Dynamic import to prevent SSR hydration issues
const Tweet = dynamic(() => import("react-tweet").then((mod) => mod.Tweet), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-xl flex justify-center">
      <div className="w-full h-[400px] bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
    </div>
  ),
});

/**
 * Proxies pbs.twimg.com image URLs to a same-origin endpoint (`/api/twitter-image/`).
 * Belt-and-suspenders hardening:
 *  - Preserve real path segments (no full-path percent-encoding)
 *  - Move/normalize query params properly (e.g., name=large for media)
 *  - Upscale profile avatars from _normal → _400x400 regardless of extension
 */
const proxy = (srcInput: string | Blob): string => {
  if (typeof srcInput !== "string") return "";
  if (!srcInput.startsWith("https://pbs.twimg.com/")) return srcInput;

  let url: URL;
  try {
    url = new URL(srcInput);
  } catch {
    return srcInput;
  }

  let pathname = url.pathname; // e.g. /profile_images/.../foo_normal.jpg
  const params = new URLSearchParams(url.search);

  // Profile avatars: prefer higher resolution suffix
  if (pathname.includes("/profile_images/")) {
    // _normal.[ext] → _400x400.[ext] (handles jpg/png/webp/jpeg)
    pathname = pathname.replace(/_normal(\.(?:jpg|jpeg|png|webp))$/i, "_400x400$1");
    const name = (params.get("name") || "").toLowerCase();
    if (name === "small" || name === "medium") params.set("name", "large");
  }

  // Tweet media and video thumbs: request large when applicable
  if (pathname.includes("/media/") || pathname.includes("/ext_tw_video_thumb/")) {
    const name = (params.get("name") || "").toLowerCase();
    if (name === "small" || name === "medium") params.set("name", "large");
    if (!params.has("name")) {
      const fmt = (params.get("format") || "").toLowerCase();
      if (fmt === "jpg") params.set("name", "large");
    }
  }

  const cleanPath = pathname.replace(/^\/+/, ""); // remove leading slash for catch-all route
  const query = params.toString();
  return `/api/twitter-image/${cleanPath}${query ? `?${query}` : ""}`;
};

import type { TweetEmbedProps } from "@/types";
import type { ImgProxyProps } from "@/types/ui";

/**
 * An image component that uses the `proxy` function to serve Twitter images.
 * It utilizes Next.js `<Image>` for optimization if width and height are provided,
 * otherwise falls back to a standard `<img>` tag.
 *
 * @param {ImgProxyProps} props - The props for the ImgProxy component.
 * @returns {JSX.Element} The rendered image element.
 */
const ImgProxy = ({ src = "", alt, width, height, className }: ImgProxyProps) => {
  // Ensure we have a string for string operations, handle Blob case
  const safeSrc = typeof src === "string" ? src : "";

  // Fallback to original pbs URL if proxy fails (belt-and-suspenders)
  const [srcStage, setSrcStage] = useState<"proxy" | "original" | "fallback">("proxy");
  const resolvedSrc =
    srcStage === "proxy"
      ? proxy(safeSrc)
      : srcStage === "original"
        ? safeSrc
        : // Final CDN fallback image for X/Twitter avatars
          getStaticImageUrl("/images/social-media/profiles/x_5469c2d0.jpg");

  const isAvatar = safeSrc.includes("/profile_images/");
  const imageWidth = width || (isAvatar ? 48 : 500);
  const imageHeight = height || (isAvatar ? 48 : 300);

  return (
    <Image
      src={resolvedSrc}
      alt={alt || (isAvatar ? "Tweet avatar" : "Tweet image")}
      width={imageWidth}
      height={imageHeight}
      onError={() => {
        if (srcStage === "proxy" && safeSrc) setSrcStage("original");
        else if (srcStage === "original") setSrcStage("fallback");
      }}
      style={
        isAvatar
          ? {
              objectFit: "cover",
              width: `${imageWidth}px`,
              height: `${imageHeight}px`,
              borderRadius: "9999px",
            }
          : {
              objectFit: "cover",
              width: "100%",
              height: "auto",
              borderRadius: "0.5rem",
            }
      }
      className={className}
    />
  );
};

/**
 * Embeds a tweet using its URL.
 * It extracts the tweet ID from the URL and uses the `react-tweet` Tweet component,
 * providing the custom `ImgProxy` for avatar and media images.
 *
 * @param {TweetEmbedProps} props - The props for the component.
 * @returns {JSX.Element | null} The rendered tweet embed, or null if the tweet ID cannot be extracted.
 */
export function TweetEmbed({ url: tweetUrl, className = "" }: TweetEmbedProps): JSX.Element | null {
  if (typeof tweetUrl !== "string") {
    console.error("TweetEmbed received non-string URL:", tweetUrl);
    return null;
  }
  const id = tweetUrl.match(/status\/(\d+)/)?.[1];
  if (!id) return null;

  return (
    <div className={`mx-auto max-w-xl flex justify-center ${className}`}>
      <Tweet
        id={id}
        components={{
          AvatarImg: ImgProxy, // author avatar
          MediaImg: ImgProxy, // images/gifs inside the tweet
        }}
      />
    </div>
  );
}
