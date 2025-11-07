"use client";

import { FileText, Loader2 } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { CvPdfDownloadButtonProps } from "@/types/cv";

const CvPdfDownloadButton: React.FC<CvPdfDownloadButtonProps> = ({ className, variant = "default" }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/cv/pdf", {
        method: "GET",
        headers: {
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        throw new Error(`Unexpected response status: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");

      const fileSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      downloadLink.href = blobUrl;
      downloadLink.download = `william-callahan-cv-${fileSuffix}.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate the PDF curriculum vitae right now.";
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const accessibleLabel = useMemo(() => {
    if (isGenerating) {
      return "Generating PDF…";
    }

    return "Download CV as PDF";
  }, [isGenerating]);

  const buttonClassName = cn(
    // Improve dark mode contrast: stronger border and lighter foreground
    "inline-flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-70",
    variant === "icon"
      ? "h-10 w-10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-900 hover:text-white"
      : "px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900 hover:text-white",
  );

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          void handleDownload();
        }}
        disabled={isGenerating}
        className={buttonClassName}
        aria-label={accessibleLabel}
      >
        {variant === "icon" ? (
          <>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="sr-only">{accessibleLabel}</span>
          </>
        ) : (
          accessibleLabel
        )}
      </button>
      <div aria-live="polite" className="mt-2 text-sm text-red-500">
        {errorMessage}
      </div>
    </div>
  );
};

export default CvPdfDownloadButton;
