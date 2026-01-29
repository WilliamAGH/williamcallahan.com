/**
 * Home Page Component
 *
 * Landing page content with personal introduction and profile image.
 * Converted to a server component for faster initial rendering.
 */

import Link from "next/link";
import { ProfileImage } from "./profile-image";

export function Home() {
  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="flex flex-col md:flex-row items-start gap-8 mb-8">
        <div className="flex-1">
          <h1 className="text-4xl font-bold mb-6">William Callahan</h1>

          <section className="mb-8">
            <p className="text-lg mb-4">
              Hello there -- I&apos;m William. I&apos;m a lifelong builder and aspiring polymath who
              finds meaning in making things better, and in helping others.
            </p>
            <p className="text-lg mb-4">
              My background is in finance and technology. Today I live and work in San Francisco /
              Silicon Valley. I grew up in the small midwestern US town of Carter Lake—a
              one-square-mile Iowa exclave, famed for two cases on its location reaching the{" "}
              <a
                href="https://en.wikipedia.org/wiki/Carter_Lake,_Iowa"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="Read about Carter Lake, Iowa on Wikipedia"
                target="_blank"
                rel="noopener noreferrer"
              >
                US Supreme Court
              </a>
              .
            </p>
            <p className="text-lg mb-4">
              (The neighboring sister town of Council Bluffs, Iowa, where I went to school, is now
              more famously known globally as <code>us-central1</code> for its Google Cloud data
              centers.)
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Current Work
            </h2>
            <p className="text-lg mb-4">
              I&apos;m currently building{" "}
              <a
                href="https://aventure.vc"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="aVenture"
                target="_blank"
                rel="noopener noreferrer"
              >
                aVenture
              </a>
              , a platform designed to bring greater transparency to private markets investing by
              using AI to analyze millions of data points about companies, their people, and
              investors.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Projects & Resources
            </h2>
            <p className="text-lg mb-4">
              If you&apos;re curious about what I&apos;m tinkering with these days, my{" "}
              <Link
                href="/projects"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="View my projects"
              >
                projects page
              </Link>{" "}
              serves as a public sandbox for my latest experiments and passion projects. I also
              regularly bookmark what I&apos;m reading, which you can find on my{" "}
              <Link
                href="/bookmarks"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="View my bookmarks"
              >
                bookmarks page
              </Link>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Connect</h2>
            <p className="text-lg mb-4">
              Feel free to connect with me on{" "}
              <a
                href="https://discord.com/users/WilliamDscord"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="Connect with me on Discord"
                target="_blank"
                rel="noopener noreferrer"
              >
                Discord
              </a>
              ,{" "}
              <a
                href="https://x.com/williamcallahan"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="Connect with me on X"
                target="_blank"
                rel="noopener noreferrer"
              >
                X
              </a>
              , or{" "}
              <a
                href="https://linkedin.com/in/williamacallahan"
                className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                title="Connect with me on LinkedIn"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
              </a>{" "}
              to chat.
            </p>
          </section>
        </div>
        <ProfileImage />
      </div>
    </div>
  );
}
