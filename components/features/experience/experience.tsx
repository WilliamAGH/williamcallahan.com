"use client";

import Image from 'next/image';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { experiences } from '@/data/experience';

export function Experience() {
  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-xl font-mono ml-4">~/experience</h1>
          </div>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {experiences.map((exp) => (
              <div
                key={exp.id}
                id={exp.id}
                className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
              >
                <div className="p-6">
                  <div className="flex items-start gap-6">
                    {exp.logo && (
                      <div className="w-16 h-16 relative flex-shrink-0">
                        <Image
                          src={exp.logo}
                          alt={`${exp.company} logo`}
                          width={64}
                          height={64}
                          className="object-contain rounded-lg"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-semibold">
                          {exp.company}
                        </h3>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {exp.period}
                        </span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                        {exp.role}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}