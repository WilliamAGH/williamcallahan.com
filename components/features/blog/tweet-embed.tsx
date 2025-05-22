import { Tweet } from 'react-tweet'

/** Swap every pbs.twimg.com image for a same-origin proxy */
const proxy = (src: string) => {
  if (!src?.startsWith('https://pbs.twimg.com/')) {
    return src;
  }

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

  const proxiedPath = modifiedSrc.slice('https://pbs.twimg.com/'.length);
  return `/api/twitter-image/${proxiedPath}`;
}

const ImgProxy = ({
  src = '',
  alt,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) => {
  console.log('[ImgProxy] Original src received:', src);
  const proxiedSrc = proxy(src);
  console.log('[ImgProxy] Proxied src to be used:', proxiedSrc);
  // plain <img> works fine; use next/image if you prefer
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={proxiedSrc} alt={alt} {...rest} />;
}

export function TweetEmbed({ url, className = '' }: { url: string; className?: string }) {
  const id = url.match(/status\/(\d+)/)?.[1]
  if (!id) return null

  return (
    <div className={`my-6 flex justify-center ${className}`}>
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
