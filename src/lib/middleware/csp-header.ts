/**
 * Content Security Policy header construction.
 *
 * Extracted from src/proxy.ts so the emitted CSP string can be unit-tested without importing the
 * middleware's Clerk/next-server module graph. The canonical directive inventory lives in
 * config/csp.ts (single owner); this module only serializes it and merges post-build style hashes.
 */

import { CSP_DIRECTIVES } from "@/config/csp";

/**
 * Dynamically imports Content Security Policy (CSP) hashes from the auto-generated file.
 *
 * The csp-hashes.json file is created post-build by scripts/generate-csp-hashes.ts and contains SHA256
 * hashes of inline scripts and styles found in the Next.js build output. Note the current policy still
 * keeps 'unsafe-inline' in both script-src and style-src: buildCspHeader merges only the style hashes and
 * intentionally omits the script hashes so the 'unsafe-inline' fallback stays effective for Next.js's
 * request-time inline scripts. These hashes are therefore an enhancement layered on top of 'unsafe-inline',
 * not a replacement for it.
 *
 * @returns Object containing arrays of CSP hash strings (scriptSrc, styleSrc).
 *
 * @note The file may not exist during the first build, which is expected behavior. In this case, empty
 *       arrays are returned for both scriptSrc and styleSrc.
 */
// Fallback when CSP hashes unavailable (first build, missing file). CSP still enforced via 'unsafe-inline'.
const CSP_HASHES_FALLBACK = { scriptSrc: [] as string[], styleSrc: [] as string[] } as const;

async function getCspHashes(): Promise<{ scriptSrc: string[]; styleSrc: string[] }> {
  try {
    const hashes = await import("../../../generated/csp-hashes.json");
    return hashes.default;
  } catch (error) {
    // [RC1] Logged fallback: CSP still works via 'unsafe-inline', hashes are an enhancement
    console.warn("[CSP] Using fallback (no hashes). Expected on first build:", error);
    return CSP_HASHES_FALLBACK;
  }
}

/**
 * Builds the serialized Content-Security-Policy header value.
 *
 * The observable security guarantee is THIS string, not the CSP_DIRECTIVES constant — so the
 * csp-header.test.ts gate asserts on the output here, catching a regression where the config still lists
 * 'unsafe-eval' (required by the blog MDX client renderer) but the served header drops it.
 */
export async function buildCspHeader(): Promise<string> {
  const cspHashes = await getCspHashes();

  // Merging script hashes with 'unsafe-inline' causes browsers to ignore 'unsafe-inline' and block
  // any inline scripts that do not have a matching hash (e.g., React server components bootstrap
  // scripts rendered at runtime). To prevent unexpected CSP violations, we **only** merge style
  // hashes. Script hashes are deliberately omitted so that the `'unsafe-inline'` fallback remains
  // effective for all inline scripts generated at request-time by Next.js.
  // Security-model note: production DOES serve 'unsafe-eval' (a deliberate reversal of the f694d075
  // hardening), because the blog MDX renderer evaluates build-time, repo-owned compiled MDX through the
  // Function constructor (`new Function`, invoked via `Reflect.construct` in mdx-content.client.tsx). The
  // directive — and the trust-boundary justification for accepting it as an interim posture pending the
  // server-render migration — lives in the canonical CSP_DIRECTIVES.scriptSrc (single owner). prod and dev
  // derive identical script sources here; no per-env subtraction.
  const scriptSrc = [...CSP_DIRECTIVES.scriptSrc];
  const styleSrc = [...CSP_DIRECTIVES.styleSrc, ...cspHashes.styleSrc];

  const cspDirectives: typeof CSP_DIRECTIVES = {
    ...CSP_DIRECTIVES,
    scriptSrc,
    styleSrc,
  };

  return Object.entries(cspDirectives)
    .map(([key, sources]) => {
      const directive = key.replaceAll(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      return `${directive} ${sources.join(" ")}`;
    })
    .join("; ");
}
