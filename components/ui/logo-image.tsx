'use client';

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import type { LogoDisplayOptions } from "../../types/logo";

interface LogoImageProps extends LogoDisplayOptions {
  url: string;
  width: number;
  height: number;
  website?: string;
}

export function LogoImage({
  url,
  width,
  height,
  className = "",
  alt = "Company Logo",
  showPlaceholder = true,
  enableInversion = false,
  isDarkTheme,
  website
}: LogoImageProps): JSX.Element | null {
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const [triedApi, setTriedApi] = useState<boolean>(false);

  const isApiUrl = (url: string): boolean => url.startsWith("/api/logo");
  const isDataUrl = (url: string): boolean => url.startsWith("data:");

  const getApiFallbackUrl = (website: string): string => {
    if (!website) {
      throw new Error("Website parameter is required for API fallback");
    }
    return `/api/logo?website=${encodeURIComponent(website)}`;
  };

  useEffect(() => {
    setError(false);
    setIsLoading(true);
    setTriedApi(false);

    if (!url) {
      setError(true);
      setIsLoading(false);
      return;
    }

    if (isApiUrl(url) || isDataUrl(url)) {
      setCurrentUrl(url);
      setIsLoading(false);
      return;
    }

    setCurrentUrl(url);
    setIsLoading(false);
  }, [url]);

  const handleError = (): void => {
    if (!triedApi && website && !isApiUrl(currentUrl)) {
      try {
        setTriedApi(true);
        setCurrentUrl(getApiFallbackUrl(website));
        return;
      } catch (err) {
        console.error("Failed to generate API fallback URL:", err);
      }
    }

    setError(true);
    setIsLoading(false);
  };

  const imageUrl = error || !currentUrl
    ? "/images/company-placeholder.svg"
    : currentUrl;

  const getInversionClass = (): string => {
    if (!enableInversion) return "";
    return isDarkTheme ? "dark:invert" : "invert-0";
  };

  if (error && !showPlaceholder) {
    return null;
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      className={`${className} ${error ? "opacity-50" : ""} ${getInversionClass()}`}
      onError={handleError}
      priority
      unoptimized={isDataUrl(imageUrl)} // Skip optimization for data URLs since they're already optimized
    />
  );
}
