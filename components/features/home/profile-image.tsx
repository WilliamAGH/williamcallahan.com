/**
 * Profile image component rendered on the server.
 * Using Next.js Image with `fill` requires its immediate parent to have
 * `position: relative`, which is provided by the wrapping div below.
 */

import Image from "next/image";

export function ProfileImage() {
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden">
      <Image
        src="/images/william-callahan-san-francisco.png"
        alt="William Callahan in San Francisco"
        width={256}
        height={256}
        className="object-cover"
        priority
      />
    </div>
  );
}
