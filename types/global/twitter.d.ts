/**
 * @file twitter.d.ts
 * @description Type definitions for the global `twttr` object from Twitter's widgets.js
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/javascript-api/overview
 */

interface Twttr {
  widgets: {
    createTweet(
      tweetId: string,
      element: HTMLElement,
      options: Record<string, unknown>,
    ): Promise<HTMLElement | undefined>;
    load(element?: HTMLElement): void;
  };
}

declare global {
  interface Window {
    twttr?: Twttr;
  }
}

// This is a global augmentation, so it doesn't export anything.
// Adding an empty export statement to satisfy the --isolatedModules flag.
export {};
