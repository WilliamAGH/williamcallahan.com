/**
 * Profile image component rendered on the server.
 * Uses a wrapper-based approach with explicit sizing to avoid mobile rendering
 * issues that can produce crescent artifacts.
 * The outer div handles the circular clipping while the inner div maintains aspect ratio.
 */

import Image from "next/image";

export function ProfileImage() {
  return (
    <div 
      className="relative w-full sm:w-80 md:w-64 rounded-full overflow-hidden"
      style={{ aspectRatio: '1 / 1' }}
    >
      <div className="absolute inset-0">
        <Image
          src="/images/william-callahan-san-francisco.png"
          alt="William Callahan in San Francisco"
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 20rem, 16rem"
          className="object-cover"
          priority
          style={{ borderRadius: 'inherit' }}
        />
      </div>
    </div>
  );
}
