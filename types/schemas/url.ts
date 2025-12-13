/**
 * URL Validation Schemas
 *
 * Zod schemas for validating URLs to prevent SSRF attacks
 * and ensure only allowed domains and protocols are accessed.
 */

import { z } from "zod/v4";

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^.*\.local$/i,
  /^::1$/i, // IPv6 loopback
  /^fc[0-9a-f]{0,2}:/i, // IPv6 ULA fc00::/7 (requires colon to avoid false positives like fdic.gov)
  /^fd[0-9a-f]{0,2}:/i, // IPv6 ULA fd00::/8 (requires colon to avoid false positives like facebook.com)
  /^fe80:/i, // IPv6 link-local
];

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_MAPPED_PREFIX = "::ffff:";
const IPV6_MAPPED_LONG_PREFIX = "0:0:0:0:0:ffff:";

/**
 * Extract the IPv4 address from an IPv6-mapped IPv4 address.
 * Handles both compressed (::ffff:) and expanded (0:0:0:0:0:ffff:) forms.
 *
 * @example
 * extractMappedIPv4("::ffff:127.0.0.1")       // "127.0.0.1"
 * extractMappedIPv4("::ffff:7f00:1")          // "127.0.0.1"
 * extractMappedIPv4("0:0:0:0:0:ffff:7f00:1")  // "127.0.0.1"
 */
function extractMappedIPv4(hostname: string): string | null {
  const lower = hostname.toLowerCase();

  // Check for both compressed and expanded IPv6-mapped prefixes
  let suffix: string;
  if (lower.startsWith(IPV6_MAPPED_PREFIX)) {
    suffix = hostname.slice(IPV6_MAPPED_PREFIX.length);
  } else if (lower.startsWith(IPV6_MAPPED_LONG_PREFIX)) {
    suffix = hostname.slice(IPV6_MAPPED_LONG_PREFIX.length);
  } else {
    return null;
  }

  // ::ffff:127.0.0.1
  if (suffix.includes(".")) {
    return suffix;
  }

  const hextets = suffix.split(":").filter(Boolean);

  // ::ffff:7f00:1
  if (hextets.length === 2 && hextets.every(h => /^[0-9a-f]{1,4}$/i.test(h))) {
    const [hiPart, loPart] = hextets;
    if (!hiPart || !loPart) return null;

    const hi = Number.parseInt(hiPart, 16);
    const lo = Number.parseInt(loPart, 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }

  // ::ffff:7f000001
  if (hextets.length === 1) {
    const [singleHextet] = hextets;
    if (!singleHextet || !/^[0-9a-f]{1,8}$/i.test(singleHextet)) {
      return null;
    }

    const value = Number.parseInt(singleHextet, 16);
    const a = (value >> 24) & 0xff;
    const b = (value >> 16) & 0xff;
    const c = (value >> 8) & 0xff;
    const d = value & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }

  return null;
}

function isPrivateIPv4(hostname: string): boolean {
  const ipv4Match = IPV4_REGEX.exec(hostname);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.length !== 4) {
    return false;
  }
  if (octets.some(octet => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 127) return true; // 127.0.0.0/8
  if (hostname === "0.0.0.0") return true; // Unroutable

  return false;
}

/**
 * Check if hostname is a private or internal IP (IPv4, IPv6, or IPv6-mapped IPv4)
 */
export function isPrivateIP(hostname: string): boolean {
  const cleanHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  const mappedIpv4 = extractMappedIPv4(cleanHostname);
  if (mappedIpv4 && isPrivateIPv4(mappedIpv4)) {
    return true;
  }

  if (isPrivateIPv4(cleanHostname)) {
    return true;
  }

  return PRIVATE_HOSTNAME_PATTERNS.some(pattern => pattern.test(cleanHostname));
}

/**
 * Base URL validation schema
 */
export const safeUrlSchema = z
  .string()
  .url()
  .refine(
    url => {
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
    },
  );

/**
 * Allowed domains for logo/image fetching
 */
const ALLOWED_LOGO_DOMAINS = new Set(
  [
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
  ].filter(Boolean) as string[],
);

/**
 * Logo URL validation schema (restricted to allowlist)
 */
export const logoUrlSchema = safeUrlSchema.refine(
  url => {
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
  },
);

/**
 * OpenGraph URL validation schema (any public domain allowed)
 */
export const openGraphUrlSchema = safeUrlSchema;

/**
 * S3 key validation schema
 */
export const s3KeySchema = z.string().refine(
  key => {
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
      /^[a-f0-9]{32,64}\.[a-z]+$/, // Hash-based names
    ];

    return validPatterns.some(pattern => pattern.test(key));
  },
  {
    message: "Invalid S3 key format",
  },
);

/**
 * Path sanitization schema
 */
export const safePathSchema = z.string().transform(path => {
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
export const twitterUsernameSchema = z.string().regex(/^[A-Za-z0-9_]{1,15}$/, "Invalid Twitter username");

/**
 * Asset ID validation schema (UUID format with or without hyphens)
 */
export const assetIdSchema = z
  .string()
  .regex(/^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i, "Invalid asset ID format");
