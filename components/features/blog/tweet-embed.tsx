/**
 * @file TweetEmbed component and related image proxy utilities.
 * This file provides a component to embed tweets using `react-tweet`
 * and includes an image proxy to serve Twitter images from the same origin,
 * with optimizations for image versions.
 */
import { Tweet } from 'react-tweet'
import Image from 'next/image'
import type { JSX } from 'react';

/**
 * Proxies pbs.twimg.com image URLs to a same-origin endpoint (`/api/twitter-image/`).
 * It also attempts to request larger versions of profile and media images.
 *
 * @param {string | Blob} srcInput - The original image source URL or Blob.
 * @returns {string} The proxied image URL, or the original src if not a pbs.twimg.com URL or if input is a Blob.
 *                   Returns an empty string if srcInput is a Blob that cannot be processed as a pbs.twimg.com URL.
 */
const proxy = (srcInput: string | Blob): string => {
  if (typeof srcInput !== 'string' || !srcInput.startsWith('https://pbs.twimg.com/')) {
    return typeof srcInput === 'string' ? srcInput : ''; // Return empty string or original if not a pbs.twimg string
  }
  const src = srcInput; // Now we know src is a string

  let modifiedSrc = src;

  // For profile images, try to get a larger version
  if (modifiedSrc.includes('/profile_images/') && modifiedSrc.endsWith('_normal.jpg')) {
    modifiedSrc = modifiedSrc.replace('_normal.jpg', '_400x400.jpg');
  }

  // For media images, always use large version
  if (modifiedSrc.includes('/media/')) {
    if (modifiedSrc.includes('name=small') || modifiedSrc.includes('name=medium')) {
      modifiedSrc = modifiedSrc.replace(/name=(small|medium)/, 'name=large');
    } else if (modifiedSrc.includes('format=jpg') && !modifiedSrc.includes('name=')) {
      modifiedSrc += '&name=large';
    }
  }

  const proxiedPath = encodeURIComponent(
    modifiedSrc.slice('https://pbs.twimg.com/'.length)
  );
  return `/api/twitter-image/${proxiedPath}`;
}

/**
 * Props for the ImgProxy component.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ImgProxyProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** The original source URL of the image or a Blob. */
  src?: string | Blob;
  /** Alt text for the image. */
  alt?: string;
  /** Optional width for Next.js Image optimization. */
  width?: number;
  /** Optional height for Next.js Image optimization. */
  height?: number;
}

/**
 * An image component that uses the `proxy` function to serve Twitter images.
 * It utilizes Next.js `<Image>` for optimization if width and height are provided,
 * otherwise falls back to a standard `<img>` tag.
 *
 * @param {ImgProxyProps} props - The props for the ImgProxy component.
 * @returns {JSX.Element} The rendered image element.
 */
const ImgProxy = ({
  src = '',
  alt,
  width,
  height,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  width?: number;
  height?: number;
}) => {
  console.log('[ImgProxy] Original src received:', src);
  const proxiedSrc = proxy(src || ''); // Ensure string for proxy, or handle Blob case if necessary
  console.log('[ImgProxy] Proxied src to be used:', proxiedSrc);

    // Use Next.js Image component for better performance when dimensions are available
  if (width && height) {
    return (
      <Image
        src={proxiedSrc}
        alt={alt || 'Tweet image'}
        width={width}
        height={height}
        {...rest}
      />
    );
  }

  // Fallback to regular img with explicit alt text for accessibility
  // eslint-disable-next-line @next/next/no-img-element
      return <img src={proxiedSrc} alt={alt || 'Tweet image'} {...rest} />;
}

/**
 * Props for the TweetEmbed component.
 */
interface TweetEmbedProps {
  /** The URL of the tweet to embed. */
  url: string;
  /** Optional CSS class names to apply to the container div. */
  className?: string;
}

/**
 * Embeds a tweet using its URL.
 * It extracts the tweet ID from the URL and uses the `react-tweet` Tweet component,
 * providing the custom `ImgProxy` for avatar and media images.
 *
 * @param {TweetEmbedProps} props - The props for the component.
 * @returns {JSX.Element | null} The rendered tweet embed, or null if the tweet ID cannot be extracted.
 */
export function TweetEmbed({ url: tweetUrl, className = '' }: TweetEmbedProps): JSX.Element | null {
  if (typeof tweetUrl !== 'string') {
    console.error('TweetEmbed received non-string URL:', tweetUrl);
    return null;
  }
  const id = tweetUrl.match(/status\/(\d+)/)?.[1]
  if (!id) return null

  return (
    <div className={`mx-auto max-w-xl flex justify-center ${className}`}>
        <Tweet
        id={id}
        components={{
          AvatarImg: ImgProxy, // author avatar
          MediaImg: ImgProxy   // images/gifs inside the tweet
        }}
      />
    </div>
  )
}
