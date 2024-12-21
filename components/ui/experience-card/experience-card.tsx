"use client";

import Image from 'next/image';
import type { Experience } from '@/types/experience';

export function ExperienceCard({ id, company, period, role, logo, website }: Experience) {
  return (
    <a
      id={id}
      href={website}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <div className="p-6 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700
        hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
        <div className="flex items-start gap-6">
          {logo && (
            <div className="w-16 h-16 relative flex-shrink-0">
              <Image
                src={logo}
                alt={`${company} logo`}
                fill
                className="object-cover rounded-lg"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {company}
              </h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {period}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {role}
            </p>
          </div>
        </div>
      </div>
    </a>
  );
}