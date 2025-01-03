/**
 * Home Page Component
 *
 * Landing page content with personal introduction and profile image.
 */

"use client";

import Image from "next/image";

export function Home() {
  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="flex flex-col md:flex-row items-start gap-8 mb-8">
        <div className="flex-1">
          <h1 className="text-4xl font-bold mb-6">William Alan Callahan</h1>
          <p className="text-lg mb-4">
            Hello &mdash; I&apos;m an entrepreneur that enjoys building.
          </p>
          <p className="text-lg mb-4">
        I have a background that includes finance and technology.
        I live in San Francisco and work in Silicon Valley, and grew up in a small town near Omaha, Nebraska,
        in the prairie of the United States.
        </p>
      <p className="text-lg mb-4">
        Today, my highest professional priority is building aVenture, a research and investing
        platform that seeks to make investing in private startups safer with better data.

        If you want to get in contact with me, you can connect with me on{' '}
        <a href="https://discord.com/users/WilliamDscord" className="text-blue-600 hover:text-blue-800">Discord</a>,{' '}
        <a href="https://x.com/williamcallahan" className="text-blue-600 hover:text-blue-800">X</a>, or{' '}
        <a href="https://linkedin.com/in/williamacallahan" className="text-blue-600 hover:text-blue-800">LinkedIn</a>.
      </p>
        </div>
        <div className="md:w-64 w-full">
          <div className="relative aspect-square overflow-hidden rounded-2xl shadow-lg">
            <Image
              src="/images/William Callahan - San Francisco.jpeg"
              alt="William Callahan in San Francisco"
              fill
              sizes="(max-width: 768px) 100vw, 256px"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}
