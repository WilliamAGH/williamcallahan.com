"use client";

import { useEffect } from "react";

const CvPdfDownloadButtonEnhancer = ({
  targetId,
  resetDelayMs = 8000,
}: {
  targetId: string;
  resetDelayMs?: number;
}): null => {
  useEffect(() => {
    const button = document.getElementById(targetId);

    if (!button) {
      return undefined;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setLoadingState = (isLoading: boolean) => {
      if (isLoading) {
        button.setAttribute("data-loading", "true");
        button.setAttribute("aria-busy", "true");
      } else {
        button.setAttribute("data-loading", "false");
        button.removeAttribute("aria-busy");
      }
    };

    const handleClick = () => {
      setLoadingState(true);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        setLoadingState(false);
        timeoutId = null;
      }, resetDelayMs);
    };

    button.addEventListener("click", handleClick);

    return () => {
      button.removeEventListener("click", handleClick);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [resetDelayMs, targetId]);

  return null;
};

export default CvPdfDownloadButtonEnhancer;
