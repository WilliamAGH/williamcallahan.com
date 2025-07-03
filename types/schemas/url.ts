/**
 * URL Validation Schemas
 * 
 * Zod schemas for validating URLs to prevent SSRF attacks
 * and ensure only allowed domains and protocols are accessed.
 */

import { z } from "zod";

/**
 * Private IP ranges that should be blocked to prevent SSRF
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./,                              // Loopback
  /^10\./,                               // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,     // Private Class B
  /^192\.168\./,                         // Private Class C
  /^169\.254\./,                         // Link-local
  /^fc00:/i,                             // IPv6 Unique Local
  /^fd[0-9a-f]{2}:/i,                    // IPv6 Unique Local (fd00::/8)
  /^fe80:/i,                             // IPv6 Link-local
  /^::1$/i,                              // IPv6 Loopback
  /^localhost$/i,                        // Localhost
  /^.*\.local$/i,                        // .local domains
];

/**
 * Check if hostname is a private IP
 */
function isPrivateIP(hostname: string): boolean {
  // Remove brackets from IPv6 addresses
  const cleanHostname = hostname.replace(/^\[|\]$/g, '');
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(cleanHostname));
}

/**
 * Base URL validation schema
 */
export const safeUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      
      // Block private IPs
      if (isPrivateIP(parsed.hostname)) {
        return false;
      }
      
      // Only allow http/https
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return false;
      }
      
      // Block URLs with credentials
      if (parsed.username || parsed.password) {
        return false;
      }
      
      // Block suspicious ports
      const port = parsed.port;
      if (port && !["80", "443", "8080", "3000"].includes(port)) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  },
  {
    message: "URL is not safe (contains private IP, credentials, or suspicious port)",
  }
);

/**
 * Allowed domains for logo/image fetching
 */
const ALLOWED_LOGO_DOMAINS = new Set([
  // Logo API services
  "logo.clearbit.com",
  "www.google.com",
  "icons.duckduckgo.com",
  "external-content.duckduckgo.com",
  
  // Common CDN domains
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  
  // Image hosting services
  "i.imgur.com",
  "images.unsplash.com",
  "pbs.twimg.com",
  "media.licdn.com",
  
  // Allow our own CDN (both server and client URLs)
  process.env.S3_CDN_URL ? new URL(process.env.S3_CDN_URL).hostname : null,
  process.env.NEXT_PUBLIC_S3_CDN_URL ? new URL(process.env.NEXT_PUBLIC_S3_CDN_URL).hostname : null,
].filter(Boolean) as string[]);

/**
 * Logo URL validation schema (restricted to allowlist)
 */
export const logoUrlSchema = safeUrlSchema.refine(
  (url) => {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname;
      
      // Check allowlist
      if (ALLOWED_LOGO_DOMAINS.has(domain)) {
        return true;
      }
      
      // Allow direct website favicons/logos
      const pathname = parsed.pathname.toLowerCase();
      const isDirectLogoPath = 
        pathname.includes("favicon") ||
        pathname.includes("logo") ||
        pathname.includes("icon") ||
        pathname.includes("apple-touch-icon") ||
        pathname.endsWith(".ico") ||
        pathname.endsWith(".svg");
        
      return isDirectLogoPath;
    } catch {
      return false;
    }
  },
  {
    message: "Domain not allowed for logo fetching",
  }
);

/**
 * OpenGraph URL validation schema (any public domain allowed)
 */
export const openGraphUrlSchema = safeUrlSchema;

/**
 * S3 key validation schema
 */
export const s3KeySchema = z.string().refine(
  (key) => {
    // No directory traversal
    if (key.includes("..") || key.includes("./") || key.includes("//")) {
      return false;
    }
    
    // Must match expected patterns
    const validPatterns = [
      /^images\/logos\/[a-zA-Z0-9._-]+$/,
      /^images\/opengraph\/[a-zA-Z0-9._-]+$/,
      /^images\/social-avatars\/[a-zA-Z0-9._/-]+$/,
      /^assets\/[a-zA-Z0-9._-]+$/,
      /^[a-f0-9]{32,64}\.[a-z]+$/,  // Hash-based names
    ];
    
    return validPatterns.some(pattern => pattern.test(key));
  },
  {
    message: "Invalid S3 key format",
  }
);

/**
 * Path sanitization schema
 */
export const safePathSchema = z.string().transform((path) => {
  // Remove directory traversal sequences
  return path
    .split("/")
    .filter(segment => segment !== ".." && segment !== ".")
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "");
});

/**
 * Twitter username validation
 */
export const twitterUsernameSchema = z.string().regex(
  /^[A-Za-z0-9_]{1,15}$/,
  "Invalid Twitter username"
);

/**
 * Asset ID validation schema (UUID format with or without hyphens)
 */
export const assetIdSchema = z.string().regex(
  /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i,
  "Invalid asset ID format"
);