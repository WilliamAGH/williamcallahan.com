/**
 * Logo Fetching Hook
 * @module lib/hooks/use-logo
 */

import { useState, useEffect } from 'react';
import { fetchLogo } from '../logo';

export function useLogo(input: string | undefined) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!input) {
      setError(true);
      return;
    }

    let mounted = true;

    const loadLogo = async () => {
      try {
        const result = await fetchLogo(input);
        if (mounted) {
          setLogoUrl(result.url);
          setError(!result.url);
        }
      } catch (err) {
        if (mounted) {
          console.error('Error loading logo:', err);
          setError(true);
        }
      }
    };

    loadLogo();

    return () => {
      mounted = false;
    };
  }, [input]);

  return {
    logoUrl,
    error
  };
}
