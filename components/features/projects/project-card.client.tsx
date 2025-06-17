"use client";

import { ExternalLink } from "@/components/ui/external-link.client";
import type { Project } from "@/types/project";
import Image from "next/image";
import React, { type JSX } from "react";

// Placeholder for centered top image with gradient
function PlaceholderImageTop() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 rounded-md">
      {" "}
      {/* Added gradient */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Placeholder image"
        className="h-16 w-16 opacity-50" // Slightly larger and more subtle
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        role="img"
      >
        {" "}
        {/* Adjusted size */}
        <title>Placeholder image</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps): JSX.Element {
  const { name, description, url, image, tags } = project;

  return (
    // Redesigned card for horizontal layout on medium screens and up
    <div className="group rounded-lg border border-gray-300 dark:border-gray-900 overflow-hidden bg-white dark:bg-gray-800 transition-all duration-300 ease-in-out hover:shadow-lg hover:border-blue-500 dark:hover:border-blue-400 opacity-0 animate-fade-in-up md:flex h-auto flex-col md:flex-row">
      {" "}
      {/* Use h-auto for responsive height */}
      {/* Image Section (Left side on md+) */}
      <div className="md:w-2/5 relative aspect-[16/10] md:aspect-auto overflow-hidden flex-shrink-0 hover:scale-105 transition-transform duration-300 ease-in-out w-full">
        {" "}
        {/* Adjust width for responsiveness */}
        <ExternalLink
          href={url}
          title={`Visit ${name}'s website`}
          rawTitle={true} // Keep raw title for accessibility
          showIcon={false}
          className="block w-full h-full" // Removed relative from here
        >
          {image ? (
            <div className="relative w-full h-full">
              <Image
                src={image}
                alt={`${name} screenshot`}
                fill
                quality={80}
                sizes="(max-width: 767px) 100vw, (min-width: 768px) 50vw" // Adjusted sizes for both mobile and desktop
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFdwI2QJIiBQAAAABJRU5ErkJggg=="
                // Subtle zoom on hover
                className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-105" // Ensure object-cover for aspect ratio
              />
            </div>
          ) : (
            <PlaceholderImageTop />
          )}
          {/* Removed Title Overlay */}
        </ExternalLink>
      </div>
      {/* Removed the div wrapper for the image */}
      {/* Content Section (Right side on md+) */}
      <div className="p-5 md:p-6 flex-1 w-full">
        {" "}
        {/* Use flex-1 to take remaining space */}
        <div className="flex flex-col h-full justify-between">
          {" "}
          {/* Allow content to space out vertically */}
          <div>
            {" "}
            {/* Top content group */}
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-2">
              {" "}
              {/* Justify between */}
              {/* Title */}
              <h3 className="text-xl font-mono font-semibold text-gray-800 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <ExternalLink
                  href={url}
                  title={`Visit ${name}'s website`}
                  showIcon={false}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {name}
                </ExternalLink>
              </h3>
              {/* Topic-Based Icon removed */}
            </div>
            {/* Code Snippet */}
            <pre className="bg-gray-800 text-green-400 p-2 rounded-md text-sm font-mono whitespace-pre-wrap">
              <code>{`// ${project.shortSummary}`}</code>
            </pre>
            {/* Description */}
            {description && (
              <p className="text-gray-400 leading-relaxed text-sm mt-1">
                {" "}
                {/* Adjusted text size/color */}
                {description}
              </p>
            )}
          </div>
          {/* Tags (Bottom aligned) */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
              {" "}
              {/* Added top border */}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300" // Adjusted size/color
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
