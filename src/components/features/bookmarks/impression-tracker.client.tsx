"use client";

import { useEffect, useRef } from "react";

interface ImpressionTrackerProps {
  contentType: string;
  contentId: string;
  onImpression: (contentType: string, contentId: string) => void;
  children: React.ReactNode;
}

const VISIBILITY_THRESHOLD = 0.5;
const IMPRESSION_DELAY_MS = 1_000;

export function ImpressionTracker({
  contentType,
  contentId,
  onImpression,
  children,
}: Readonly<ImpressionTrackerProps>) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || hasTrackedRef.current) {
      return;
    }

    const clearPendingImpression = () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        if (entry.isIntersecting) {
          if (timeoutIdRef.current !== null || hasTrackedRef.current) {
            return;
          }

          timeoutIdRef.current = window.setTimeout(() => {
            if (hasTrackedRef.current) {
              return;
            }

            hasTrackedRef.current = true;
            onImpression(contentType, contentId);
            clearPendingImpression();
            observer.disconnect();
          }, IMPRESSION_DELAY_MS);
          return;
        }

        clearPendingImpression();
      },
      { threshold: VISIBILITY_THRESHOLD },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      clearPendingImpression();
    };
  }, [contentId, contentType, onImpression]);

  return <div ref={elementRef}>{children}</div>;
}
