/**
 * Profile image component rendered on the server.
 * Uses a direct approach with explicit dimensions to avoid iOS Safari rendering
 * issues that can produce crescent artifacts. No nested absolute positioning.
 */

import Image from "next/image";

export function ProfileImage() {
  return (
    <div className="mx-auto w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
      <Image
        src="/images/william-callahan-san-francisco.png"
        alt="William Callahan in San Francisco"
        width={288}
        height={288}
        sizes="(max-width:640px) 224px, (max-width:768px) 256px, 288px"
        className="object-cover w-full h-full rounded-full"
        priority
      />
    </div>
  );
}
