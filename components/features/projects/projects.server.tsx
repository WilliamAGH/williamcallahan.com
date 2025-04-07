import React from 'react';
import Link from 'next/link'; // Import Link
import { projects } from '@/data/projects';
import { ProjectCardServer } from './project-card.server';
import { WindowControls } from '@/components/ui/navigation/window-controls';

export function ProjectsServer() {
  return (
    // Added outer container and styled box matching /education
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-xl font-mono ml-4">~/project-sandbox</h1> {/* Changed title */}
          </div>
        </div>

        <div className="p-6"> {/* Inner padding */}
          {/* Intro Text Section */}
          <div className="prose dark:prose-invert max-w-none mb-8">
            <p>
              Welcome to my a sandbox of my various experiments / projects / works-in-progress. Be sure to visit my{' '}
              <Link href="/experience" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                experience page
              </Link>{' '}
              if you&apos;d like a better look at some of my more &apos;complete&apos; work as well.
              <br /><br />
              This section showcases various projects, experiments, and proof-of-concepts I&apos;ve worked on and tinkered with.
            </p>
          </div>

          {/* Project Cards List */}
          <div className="space-y-6"> {/* Adjusted spacing */}
            {projects.map((project) => (
              <ProjectCardServer key={project.name} project={project} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
