import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navigation, Terminal, SocialIcons, ThemeToggle } from '@/components/ui';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'William Alan Callahan',
  description: 'Portfolio and personal website of William Alan Callahan',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 transition-colors duration-200">
            <header className="fixed top-0 w-full bg-white/80 dark:bg-[#1a1b26]/80 backdrop-blur-sm z-50">
              <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                <Navigation />
                <div className="flex items-center space-x-4">
                  <SocialIcons />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="pt-24 pb-16 px-4">
              <Terminal />
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}