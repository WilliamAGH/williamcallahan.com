"use client";

import Image from "next/image";
import type { JSX } from "react";
/**
 * @file TweetEmbed component and related image proxy utilities.
 * This file provides a component to embed tweets using `react-tweet`
 * and includes an image proxy to serve Twitter images from the same origin,
 * with optimizations for image versions.
 */
import { Tweet } from "react-tweet";

/**
 * Proxies pbs.twimg.com image URLs to a same-origin endpoint (`/api/twitter-image/`).
 * It also attempts to request larger versions of profile and media images.
 *
 * @param {string | Blob} srcInput - The original image source URL or Blob.
 * @returns {string} The proxied image URL, or the original src if not a pbs.twimg.com URL or if input is a Blob.
 *                   Returns an empty string if srcInput is a Blob that cannot be processed as a pbs.twimg.com URL.
 */
const proxy = (srcInput: string | Blob): string => {
  if (typeof srcInput !== "string" || !srcInput.startsWith("https://pbs.twimg.com/")) {
    return typeof srcInput === "string" ? srcInput : ""; // Return empty string or original if not a pbs.twimg string
  }
  const src = srcInput; // Now we know src is a string

  let modifiedSrc = src;

  // For profile images, try to get a larger version
  if (modifiedSrc.includes("/profile_images/") && modifiedSrc.endsWith("_normal.jpg")) {
    modifiedSrc = modifiedSrc.replace("_normal.jpg", "_400x400.jpg");
  }

  // For media images, always use large version
  if (modifiedSrc.includes("/media/")) {
    if (modifiedSrc.includes("name=small") || modifiedSrc.includes("name=medium")) {
      modifiedSrc = modifiedSrc.replace(/name=(small|medium)/, "name=large");
    } else if (modifiedSrc.includes("format=jpg") && !modifiedSrc.includes("name=")) {
      modifiedSrc += "&name=large";
    }
  }

  const proxiedPath = encodeURIComponent(modifiedSrc.slice("https://pbs.twimg.com/".length));
  return `/api/twitter-image/${proxiedPath}`;
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
const ImgProxy = ({ src = "", alt, width, height, ...rest }: ImgProxyProps) => {
  const proxiedSrc = proxy(src || "");
  // Ensure we have a string for string operations, handle Blob case
  const safeSrc = typeof src === "string" ? src : "";

  const imageWidth = width || (safeSrc.includes("/profile_images/") ? 48 : 500);
  const imageHeight = height || (safeSrc.includes("/profile_images/") ? 48 : 300);

  return (
    <Image
      src={proxiedSrc}
      alt={alt || "Tweet image"}
      width={imageWidth}
      height={imageHeight}
      style={{
        objectFit: "cover",
        width: "100%",
        height: "auto",
        borderRadius: safeSrc.includes("/profile_images/") ? "9999px" : "0.5rem",
      }}
      {...rest}
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
