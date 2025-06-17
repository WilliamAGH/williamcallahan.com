/**
 * Profile image component rendered on the server.
 * Combines circular clipping and aspect-ratio in a single wrapper to avoid
 * mobile rounding quirks that produced a crescent artifact.
 * Uses Next.js <Image fill> for responsive sizing.
 */

import Image from "next/image";

export function ProfileImage() {
  return (
    <div className="relative rounded-full overflow-hidden w-full aspect-square sm:w-80 md:w-64">
      <Image
        src="/images/william-callahan-san-francisco.png"
        alt="William Callahan in San Francisco"
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 768px) 20rem, 16rem"
        className="object-cover"
        priority
      />
    </div>
  );
}
