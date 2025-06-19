"use client";

import type React from "react";
import { useEffect, useRef } from "react";

import type { StandardTweetEmbedProps } from "@/types";

const StandardTweetEmbed: React.FC<StandardTweetEmbedProps> = ({ id, theme }) => {
  const embedContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const createTweetEmbed = () => {
      if (window.twttr?.widgets && embedContainerRef.current) {
        // Clear previous tweet before rendering a new one
        embedContainerRef.current.innerHTML = "";

        window.twttr.widgets
          .createTweet(id, embedContainerRef.current, {
            theme,
            dnt: true,
          })
          .catch((error) => console.error("Error creating Tweet embed:", error));
      }
    };

    const scriptId = "twitter-widgets-script";

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.charset = "utf-8";
      document.body.appendChild(script);
      script.onload = createTweetEmbed;
    } else {
      createTweetEmbed();
    }
  }, [id, theme]);

  return (
    <div ref={embedContainerRef} className={`standard-tweet-embed-wrapper theme-${theme}`}>
      {/* Tweet will be rendered here by the script */}
    </div>
  );
};

export default StandardTweetEmbed;
