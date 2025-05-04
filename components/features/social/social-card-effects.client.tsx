"use client";

/**
 * Social Brand Hover Effects Component
 * 
 * This component applies subtle brand color effects to social media cards on hover.
 * It uses CSS filters which work universally on SVGs regardless of implementation.
 */

import React from 'react';

export function SocialCardEffects() {
  return (
    <style jsx global>{`
      /* Base transition for all cards to reduce jerkiness */
      .linkedin-card img[src*="linkedin.svg"],
      .github-card img[src*="github.svg"],
      .twitter-card img[src*="twitter-x.svg"] {
        transition: filter 0.3s ease, opacity 0.3s ease;
      }
      
      /* Shared card hover behavior */
      .linkedin-card,
      .github-card,
      .twitter-card,
      .bluesky-card,
      .discord-card {
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.3s ease !important;
      }
      
      /* Default state styles for all SVG backgrounds - add solid white rectangle background for consistency */
      .linkedin-card img[src*="linkedin.svg"],
      .github-card img[src*="github.svg"],
      .twitter-card img[src*="twitter-x.svg"] {
        background-color: #ffffff !important;
        border-radius: 2px;
      }
      
      /* LinkedIn: blue (#0A66C2) */
      .linkedin-card:hover img[src*="linkedin.svg"] {
        filter: invert(36%) sepia(71%) saturate(6695%) hue-rotate(196deg) brightness(92%) contrast(98%) !important;
        opacity: 0.9 !important;
      }
      
      /* GitHub: purple-ish (#6e5494) for hover */
      .github-card:hover img[src*="github.svg"] {
        filter: invert(32%) sepia(11%) saturate(1500%) hue-rotate(208deg) brightness(94%) contrast(87%);
        opacity: 0.9;
      }
      
      /* X/Twitter: blue (#1DA1F2) */
      .twitter-card:hover img[src*="twitter-x.svg"] {
        filter: invert(55%) sepia(98%) saturate(1195%) hue-rotate(176deg) brightness(100%) contrast(89%);
        opacity: 0.9;
      }
      
      /* Subtle card highlights with brand colors */
      .linkedin-card:hover {
        border-color: rgba(10, 102, 194, 0.3) !important;
      }
      
      .github-card:hover {
        border-color: rgba(110, 84, 148, 0.3) !important;
      }
      
      .twitter-card:hover {
        border-color: rgba(29, 161, 242, 0.3) !important;
      }
      
      /* Generic hover for other cards */
      .bluesky-card:hover,
      .discord-card:hover {
        border-color: rgba(99, 102, 241, 0.3) !important;
      }
    `}</style>
  );
}