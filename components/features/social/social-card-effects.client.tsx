"use client";

/**
 * Social Brand Hover Effects Component
 * 
 * This component applies subtle brand color effects to social media cards on hover.
 * Uses a simple, reliable approach compatible with all browsers.
 */

import React from 'react';

export function SocialCardEffects() {
  return (
    <style jsx global>{`
      /* Base white background for all social cards */
      .linkedin-card img.linkedin-banner,
      .github-card img.social-banner,
      .twitter-card img.social-banner,
      .bluesky-card img.social-banner,
      .discord-card img.social-banner {
        background-color: #ffffff !important;
        border-radius: 4px;
        transition: transform 0.4s ease;
      }
      
      /* Position relative on cards for border effects */
      .linkedin-card,
      .github-card,
      .twitter-card,
      .bluesky-card,
      .discord-card {
        position: relative;
        border: 1px solid transparent;
        transition: border-color 0.3s ease, box-shadow 0.4s ease !important;
      }
      
      /* Simple glow effect on the card itself - much more reliable */
      .linkedin-card:hover {
        border-color: rgba(10, 102, 194, 0.5) !important;
        box-shadow: 0 0 15px 0px rgba(10, 102, 194, 0.4) !important;
      }
      
      .github-card:hover {
        border-color: rgba(110, 84, 148, 0.5) !important;
        box-shadow: 0 0 15px 0px rgba(110, 84, 148, 0.4) !important;
      }
      
      .twitter-card:hover {
        border-color: rgba(29, 161, 242, 0.5) !important;
        box-shadow: 0 0 15px 0px rgba(29, 161, 242, 0.4) !important;
      }
      
      .bluesky-card:hover {
        border-color: rgba(0, 153, 255, 0.5) !important;
        box-shadow: 0 0 15px 0px rgba(0, 153, 255, 0.4) !important;
      }
      
      .discord-card:hover {
        border-color: rgba(114, 137, 218, 0.5) !important;
        box-shadow: 0 0 15px 0px rgba(114, 137, 218, 0.4) !important;
      }
      
      /* Slight scale effect on the banner images */
      .linkedin-card:hover img.linkedin-banner,
      .github-card:hover img.social-banner,
      .twitter-card:hover img.social-banner,
      .bluesky-card:hover img.social-banner,
      .discord-card:hover img.social-banner {
        transform: scale(1.02);
      }
      
      /* Add a colored bar at the top of each card */
      .linkedin-card::after,
      .github-card::after,
      .twitter-card::after,
      .bluesky-card::after,
      .discord-card::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 0;
        transition: height 0.3s ease;
        border-radius: 24px 24px 0 0;
        opacity: 0.8;
      }
      
      .linkedin-card:hover::after {
        height: 4px;
        background-color: #0A66C2;
      }
      
      .github-card:hover::after {
        height: 4px;
        background-color: #6e5494;
      }
      
      .twitter-card:hover::after {
        height: 4px;
        background-color: #1DA1F2;
      }
      
      .bluesky-card:hover::after {
        height: 4px;
        background-color: #0099ff;
      }
      
      .discord-card:hover::after {
        height: 4px;
        background-color: #7289da;
      }
    `}</style>
  );
}