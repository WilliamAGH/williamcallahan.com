"use client";

import React, { useEffect, useRef } from "react";

import type { StandardTweetEmbedProps } from "@/types";

const StandardTweetEmbed: React.FC<StandardTweetEmbedProps> = ({ id, theme }) => {
  const embedContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Capture the container reference early in the effect
    const containerElement = embedContainerRef.current;

    const createTweetEmbed = () => {
      if (window.twttr?.widgets && containerElement) {
        // Clear previous tweet safely for Safari compatibility
        // Use a more defensive approach to avoid DOM manipulation conflicts

        // Remove all child nodes instead of using innerHTML
        while (containerElement.firstChild) {
          try {
            containerElement.removeChild(containerElement.firstChild);
          } catch (e) {
            // In case of DOM exception (e.g., node already removed), break the loop
            console.warn("Tweet embed cleanup warning:", e);
            break;
          }
        }

        window.twttr.widgets
          .createTweet(id, containerElement, {
            theme,
            dnt: true,
          })
          .catch(error => console.error("Error creating Tweet embed:", error));
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
      script.addEventListener("load", createTweetEmbed, { once: true });
    } else {
      createTweetEmbed();
    }

    // Cleanup function to handle component unmounting
    return () => {
      // Use the captured container reference to avoid stale closure issues
      if (containerElement) {
        // Safely clear the container on unmount
        while (containerElement.firstChild) {
          try {
            containerElement.removeChild(containerElement.firstChild);
          } catch {
            // Ignore errors during cleanup
            break;
          }
        }
      }
    };
  }, [id, theme]);

  return (
    <div ref={embedContainerRef} className={`standard-tweet-embed-wrapper theme-${theme}`}>
      {/* Tweet will be rendered here by the script */}
    </div>
  );
};

export default StandardTweetEmbed;
