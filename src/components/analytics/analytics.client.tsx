"use client";

import Script from "next/script";

const SIMPLE_ANALYTICS_NOSCRIPT_PIXEL =
  '<img src="https://queue.simpleanalyticscdn.com/noscript.gif?collect-dnt=true" referrerpolicy="no-referrer-when-downgrade" width="1" height="1" style="display:none" alt="" />';
const CLICKY_NOSCRIPT_PIXEL =
  '<img src="https://in.getclicky.com/101484018ns.gif" width="1" height="1" style="display:none" alt="" />';

/** Loads the active third-party analytics providers outside development. */
export function Analytics() {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  return (
    <>
      <Script
        id="simple-analytics"
        strategy="afterInteractive"
        src="https://scripts.simpleanalyticscdn.com/latest.js"
        data-collect-dnt="true"
        async
      />
      <noscript dangerouslySetInnerHTML={{ __html: SIMPLE_ANALYTICS_NOSCRIPT_PIXEL }} />

      {/* Clicky Analytics - Official docs: https://clicky.com/help/custom */}
      <Script
        id="clicky"
        strategy="afterInteractive"
        src="https://static.getclicky.com/101484018.js"
        async
      />
      <noscript dangerouslySetInnerHTML={{ __html: CLICKY_NOSCRIPT_PIXEL }} />
    </>
  );
}
