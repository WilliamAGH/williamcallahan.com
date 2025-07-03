/**
 * Home Page Component
 *
 * Landing page content with personal introduction and profile image.
 * Converted to a server component for faster initial rendering.
 */

import { ProfileImage } from "./profile-image";

export function Home() {
  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="flex flex-col md:flex-row items-start gap-8 mb-8">
        <div className="flex-1">
          <h1 className="text-4xl font-bold mb-6">William Callahan</h1>
          <p className="text-lg mb-4">Hello &mdash; I&apos;m an entrepreneur that enjoys building.</p>
          <p className="text-lg mb-4">
            My background is in finance and technology. I build in Silicon Valley, but my story begins in Carter Lake—a
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
            My school bus route led to Council Bluffs (now better known in tech as Google Cloud&apos;s
            &apos;us-central1&apos; data centers), and I later settled in Omaha before heading west to San Francisco,
            California a few years ago.
          </p>
          <p className="text-lg mb-4">
            Today, my highest professional priority is building{" "}
            <a
              href="https://aventure.vc"
              className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              title="aVenture"
              target="_blank"
              rel="noopener noreferrer"
            >
              aVenture
            </a>
            , a research and investing platform that seeks to make investing in private startups safer with better data.
          </p>
          <p className="text-lg mb-4">
            I also share my experimental projects in an online &apos;sandbox&apos;, all available on my{" "}
            <a
              href="/projects"
              className="text-blue-400 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              title="View my projects"
            >
              projects page
            </a>
            .
          </p>
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
        </div>
        <ProfileImage />
      </div>
    </div>
  );
}
