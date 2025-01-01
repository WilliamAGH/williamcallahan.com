/**
 * Home Page Component
 *
 * Landing page content with personal introduction.
 */

"use client";

export function Home() {
  return (
    <div className="max-w-4xl mx-auto mt-8">
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

        If you want to get in contact with me, you can connect with me on
      </p>
    </div>
  );
}