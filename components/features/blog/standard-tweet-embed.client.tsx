'use client';

import React, { useEffect, useRef } from 'react';

// Ensure window.twttr is typed for TypeScript
declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement | null) => void;
      };
    };
  }
}

interface StandardTweetEmbedProps {
  theme: 'light' | 'dark';
}

const StandardTweetEmbed: React.FC<StandardTweetEmbedProps> = ({ theme }) => {
  const embedContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadTwitterWidget = () => {
      if (window.twttr && window.twttr.widgets && embedContainerRef.current) {
        // Ensure any existing content from a previous render is cleared
        // or that widgets.load can correctly re-process.
        // For simplicity, we rely on widgets.load() to handle updates.
        window.twttr.widgets.load(embedContainerRef.current);
      }
    };

    const scriptId = 'twitter-widgets-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      document.body.appendChild(script);
      script.onload = loadTwitterWidget;
    } else {
      // If script is already loaded, just call load.
      // This ensures that if the component re-renders (e.g., theme prop changes),
      // the tweet is re-processed by the Twitter widget script.
      loadTwitterWidget();
    }
    // No cleanup for the script tag itself, as it's generally loaded once per page
    // and used by all tweet embeds.
  }, [theme]); // Re-run effect if theme changes to re-render the tweet.

  return (
    <div ref={embedContainerRef} className={`standard-tweet-embed-wrapper theme-${theme}`}>
      {/* This is the exact blockquote structure from the working tweet-test.html */}
      <blockquote
        className="twitter-tweet"
        data-lang="en"
        data-dnt="true"
        data-theme={theme} // Use the theme prop here
      >
        <p lang="en" dir="ltr">
          At dawn from the gateway to Mars, the launch of Starship’s second flight test{' '}
          <a href="https://t.co/ffKnsVKwG4">pic.twitter.com/ffKnsVKwG4</a>
        </p>
        &mdash; SpaceX (@SpaceX){' '}
        <a href="https://twitter.com/SpaceX/status/1732824684683784516?ref_src=twsrc%5Etfw">
          December 7, 2023
        </a>
      </blockquote>
    </div>
  );
};

export default StandardTweetEmbed;
