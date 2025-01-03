"use client";

/**
 * Logo Image Component
 * @module components/ui/logo-image
 * @description
 * React component for displaying company logos with automatic
 * theme-based inversion and fallback handling.
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import type { LogoDisplayOptions } from '../../types/logo';

interface LogoImageProps extends LogoDisplayOptions {
  /** URL of the logo to display */
  url: string;
  /** Width of the image in pixels */
  width: number;
  /** Height of the image in pixels */
  height: number;
  /** Optional website URL for API fallback */
  website?: string;
}

/**
 * Logo Image Component
 * @component
 * @param {LogoImageProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export default function LogoImage({
  url,
  width,
  height,
  className = '',
  alt = 'Company Logo',
  showPlaceholder = true,
  website
}: LogoImageProps): JSX.Element {
  const { theme } = useTheme();
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const [triedApi, setTriedApi] = useState<boolean>(false);

  // Check if URL is already an API URL
  const isApiUrl = (url: string): boolean => url.startsWith('/api/logo');

  // Get API fallback URL
  const getApiFallbackUrl = (website: string): string => {
    return `/api/logo?website=${encodeURIComponent(website)}`;
  };

  useEffect(() => {
    if (!url) {
      setError(true);
      setIsLoading(false);
      return;
    }

    // If it's already an API URL or we've already tried the API, use the URL directly
    if (isApiUrl(url) || triedApi) {
      setCurrentUrl(url);
      setError(false);
      setIsLoading(false);
      return;
    }

    // For non-API URLs, try the local path first
    setCurrentUrl(url);
    setTriedApi(false);
    setError(false);
    setIsLoading(false);
  }, [url, triedApi]);

  const handleImageError = () => {
    // If we haven't tried the API yet and we have a website URL
    if (!triedApi && website && !isApiUrl(url)) {
      setTriedApi(true);
      setCurrentUrl(getApiFallbackUrl(website));
      return;
    }

    // If we've already tried the API or don't have a website URL, show placeholder
    setError(true);
    setIsLoading(false);
  };

  const imageUrl = error || isLoading || !currentUrl
    ? '/images/company-placeholder.svg'
    : currentUrl;

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      className={`${className} ${error ? 'opacity-50' : ''}`}
      onError={handleImageError}
      priority // Load immediately as logos are usually above the fold
    />
  );
}
