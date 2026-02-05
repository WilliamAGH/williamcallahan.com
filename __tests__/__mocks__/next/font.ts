/**
 * Mock for next/font/google and next/font/local
 */

interface FontOptions {
  weight?: string | string[];
  style?: string | string[];
  subsets?: string[];
  display?: string;
  variable?: string;
  preload?: boolean;
}

interface FontResult {
  className: string;
  style: { fontFamily: string };
  variable?: string;
}

export function Inter(_options?: FontOptions): FontResult {
  return {
    className: "mock-font-inter",
    style: { fontFamily: "Inter, sans-serif" },
    variable: "--font-inter",
  };
}

export function Roboto(_options?: FontOptions): FontResult {
  return {
    className: "mock-font-roboto",
    style: { fontFamily: "Roboto, sans-serif" },
    variable: "--font-roboto",
  };
}

// Generic mock for any font
export default function mockFont(_options?: FontOptions): FontResult {
  return {
    className: "mock-font",
    style: { fontFamily: "sans-serif" },
    variable: "--font-mock",
  };
}
