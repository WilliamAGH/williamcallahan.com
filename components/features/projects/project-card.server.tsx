import React from 'react';
import Image from 'next/image';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import type { Project } from '@/types/project';
import { ExternalLink } from '@/components/ui/externalLink';

// Placeholder for centered top image
function PlaceholderImageTop() {
  return (
    <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 rounded-md"> {/* Adjusted rounding */}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"> {/* Adjusted size */}
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
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 group-hover:shadow-lg"> {/* Removed flex */}

      {/* Image Section (Top, Centered, Constrained Width) */}
      <div className="p-4 sm:p-5"> {/* Add padding around image container */}
        <div className="max-w-lg mx-auto aspect-[16/10] relative overflow-hidden rounded-md"> {/* Constrained width, centered, aspect ratio */}
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
                className="object-cover" // Removed rounding here, added to container
              />
            ) : (
              <PlaceholderImageTop />
            )}
          </ExternalLink>
        </div>
      </div>

      {/* Content Section (Below Image) */}
      <div className="p-4 sm:p-5 pt-0"> {/* Adjusted padding */}
        <div className="flex flex-col gap-3"> {/* Adjusted gap */}
          {/* Header */}
          <div className="flex items-center gap-2">
            {/* Optional: Small logo can go here if desired */}
            {/* <div className="w-8 h-8 relative flex-shrink-0 rounded border border-gray-100 dark:border-gray-700 overflow-hidden"> ... </div> */}
            <div className="flex-1 min-w-0">
              <ExternalLink
                href={url}
                title={`Visit ${name}'s website`}
                showIcon={false}
                className="text-lg font-semibold hover:text-gray-600 dark:hover:text-gray-300 truncate" // Reverted text size
              >
                {name}
              </ExternalLink>
            </div>
            {url && (
              <ExternalLink
                href={url}
                title={`Visit ${name}'s website`}
                showIcon={false}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
              >
                <ExternalLinkIcon className="w-4 h-4" />
              </ExternalLink>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm mt-1"> {/* Reverted margin */}
              {description}
            </p>
          )}

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3"> {/* Adjusted gap/margin */}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" // Reverted size/padding
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
