/**
 * Profile image component rendered on the server.
 * Uses a direct approach with explicit dimensions to avoid iOS Safari rendering
 * issues that can produce crescent artifacts. No nested absolute positioning.
 */

import Image from "next/image";

export function ProfileImage() {
  return (
    <div className="profile-image-container mx-auto">
      <div 
        className="relative w-full max-w-[280px] sm:w-80 md:w-64 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
        style={{ 
          width: '100%',
          maxWidth: '280px',
          height: 'auto',
          aspectRatio: '1 / 1'
        }}
      >
        <Image
          src="/images/william-callahan-san-francisco.png"
          alt="William Callahan in San Francisco"
          fill
          sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 256px"
          className="object-cover rounded-full"
          priority
          style={{ 
            borderRadius: '50%',
            objectFit: 'cover'
          }}
        />
      </div>
    </div>
  );
}
