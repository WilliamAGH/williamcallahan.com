"use client";

import { useCallback, useEffect, useRef } from "react";

import type { EngagementContentType } from "@/lib/db/schema/content-engagement";
import type { EngagementEvent } from "@/types/schemas/engagement";

const ENGAGEMENT_ENDPOINT = "/api/engagement";
const IMPRESSION_FLUSH_INTERVAL_MS = 30_000;

function buildPayload(events: EngagementEvent[]): string {
  return JSON.stringify({ events });
}

function sendEvents(events: EngagementEvent[]): void {
  if (events.length === 0) {
    return;
  }

  const payload = buildPayload(events);
  const canUseBeacon =
    typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function";

  if (canUseBeacon && navigator.sendBeacon(ENGAGEMENT_ENDPOINT, payload)) {
    return;
  }

  void fetch(ENGAGEMENT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch((error: unknown) => {
    console.error("[useEngagementTracker] Failed to send engagement events:", error);
  });
}

function getNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function useEngagementTracker() {
  const impressionsRef = useRef<EngagementEvent[]>([]);
  const dntEnabledRef = useRef(false);

  const flushImpressions = useCallback(() => {
    if (dntEnabledRef.current || impressionsRef.current.length === 0) {
      return;
    }

    const events = impressionsRef.current;
    impressionsRef.current = [];
    sendEvents(events);
  }, []);

  useEffect(() => {
    dntEnabledRef.current = typeof navigator !== "undefined" && navigator.doNotTrack === "1";

    if (dntEnabledRef.current) {
      return;
    }

    const intervalId = window.setInterval(flushImpressions, IMPRESSION_FLUSH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushImpressions();
      }
    };

    const handlePageHide = () => {
      flushImpressions();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      flushImpressions();
    };
  }, [flushImpressions]);

  const trackImpression = useCallback((contentType: EngagementContentType, contentId: string) => {
    if (dntEnabledRef.current) {
      return;
    }

    impressionsRef.current.push({
      contentType,
      contentId,
      eventType: "impression",
    });
  }, []);

  const trackDwell = useCallback((contentType: EngagementContentType, contentId: string) => {
    if (dntEnabledRef.current) {
      return () => {};
    }

    const start = getNowMs();
    let sent = false;

    const sendDwell = () => {
      if (sent) {
        return;
      }

      sent = true;
      const durationMs = Math.max(0, Math.round(getNowMs() - start));
      sendEvents([
        {
          contentType,
          contentId,
          eventType: "dwell",
          durationMs,
        },
      ]);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendDwell();
      }
    };

    const handlePageHide = () => {
      sendDwell();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      sendDwell();
    };
  }, []);

  const trackExternalClick = useCallback(
    (contentType: EngagementContentType, contentId: string) => {
      if (dntEnabledRef.current) {
        return;
      }

      sendEvents([
        {
          contentType,
          contentId,
          eventType: "external_click",
        },
      ]);
    },
    [],
  );

  return {
    trackImpression,
    trackDwell,
    trackExternalClick,
  };
}
