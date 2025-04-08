import React from 'react';
import Image from 'next/image';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import type { Project } from '@/types/project';
import { ExternalLink } from '@/components/ui/externalLink';

// Placeholder for centered top image with gradient
function PlaceholderImageTop() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 rounded-md"> {/* Added gradient */}
      <svg xmlns="http://www.w3.org/2000/svg"
           aria-label="Placeholder image"
           className="h-16 w-16 opacity-50" // Slightly larger and more subtle
           fill="none"
           viewBox="0 0 24 24"
           stroke="currentColor"
           role="img"> {/* Adjusted size */}
        <title>Placeholder image</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

interface ProjectCardServerProps {
  project: Project;
}

export function ProjectCardServer({ project }: ProjectCardServerProps): JSX.Element {
  const { name, description, url, image, tags } = project;

  return (
    // Enhanced card styling with more hover effects and entrance transition base
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1.5 hover:border-blue-400 dark:hover:border-blue-500 opacity-0 animate-fade-in-up"> {/* Added animation class, adjusted hover */}

      {/* Image Section (Top) - Increased prominence */}
      <div className="aspect-[16/9] relative overflow-hidden"> {/* Removed group-hover opacity here */}
          <ExternalLink
            href={url}
            title={`Visit ${name}'s website`}
            rawTitle={true}
            showIcon={false}
            className="block w-full h-full"
          >
            {image ? (
              <Image
                src={image}
                alt={`${name} screenshot`}
                fill
                quality={80}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFdwI2QJIiBQAAAABJRU5ErkJggg=="
                className="object-cover" // Image covers the container
              />
            ) : (
              <PlaceholderImageTop />
            )}
             {/* Title Overlay on Hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
              <h3 className="text-white text-lg font-semibold drop-shadow-md translate-y-2 group-hover:translate-y-0 transition-transform duration-300 ease-in-out">
                {name}
              </h3>
            </div>
          </ExternalLink>
        </div>
      {/* Removed the div wrapper for the image */}

      {/* Content Section (Below Image) - Increased padding */}
      <div className="p-4 sm:p-5"> {/* Slightly reduced padding for balance */}
        <div className="flex flex-col gap-3"> {/* Increased gap */}
          {/* Header - Title is now primarily shown on image hover */}
          <div className="flex items-center justify-end gap-3 h-5"> {/* Justify end for link icon, added fixed height */}
            {/* Removed title link from here as it's on the image overlay */}
            {/* The ExternalLink icon is the only content here now */}
            {url && (
              <ExternalLink
                href={url}
                title={`Visit ${name}'s website`}
                showIcon={false}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 flex-shrink-0" // Adjusted colors
              >
                <ExternalLinkIcon className="w-5 h-5" /> {/* Slightly larger icon */}
              </ExternalLink>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base mt-2 line-clamp-3"> {/* Increased font size, adjusted colors/margin */}
              {description}
            </p>
          )}

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4"> {/* Increased gap/margin */}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200" // Increased size/padding, adjusted colors
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
