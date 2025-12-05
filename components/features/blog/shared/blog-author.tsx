/**
 * Blog Author Component
 *
 * Displays author information with avatar and optional bio.
 * Avatar and name link to the homepage. Bio is rendered separately to
 * support inline links without creating invalid nested anchor elements.
 *
 * @component
 * @param {Object} props
 * @param {Author} props.author - Author information including name, avatar, and bio
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BlogAuthorProps } from "@/types/features";

import { buildCachedImageUrl } from "@/lib/utils/cdn-utils";

export function BlogAuthor({ author }: BlogAuthorProps) {
  const [isMounted, setIsMounted] = useState(false);

  const proxiedAvatar = author.avatar ? buildCachedImageUrl(author.avatar, 64) : undefined;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/10 dark:to-indigo-950/10 border border-blue-100 dark:border-gray-800 shadow-sm">
      <Link
        href="/"
        className="flex items-center gap-4 hover:opacity-80 transition-opacity"
        aria-label={`About ${author.name}`}
      >
        {author.avatar && isMounted && (
          <div
            className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-blue-200 dark:ring-blue-900/50 shadow-inner flex-shrink-0"
            title={`About ${author.name}`}
          >
            <Image
              src={proxiedAvatar ?? author.avatar}
              alt={`Photo of ${author.name} - San Francisco, CA`}
              fill
              sizes="56px"
              className="rounded-full object-cover"
              priority
              unoptimized
            />
          </div>
        )}
        {!isMounted && author.avatar && (
          <div
            className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-blue-200 dark:ring-blue-900/50 shadow-inner bg-gray-200 dark:bg-gray-700 flex-shrink-0"
            title={`About ${author.name}`}
            aria-label={`${author.name} avatar loading`}
          />
        )}
        <div className="font-semibold text-gray-900 dark:text-white text-lg">{author.name}</div>
      </Link>
      {author.bio && <p className="text-sm text-gray-700 dark:text-gray-400 mt-2 ml-[4.5rem]">{author.bio}</p>}
    </div>
  );
}
