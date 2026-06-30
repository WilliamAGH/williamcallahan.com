/**
 * CSP header-contract test.
 *
 * The CSP_DIRECTIVES assertions in utils.test.ts pin the config constant, but the user-observable
 * guarantee is the emitted Content-Security-Policy header built by `buildCspHeader()`. This suite asserts
 * on that output so CI fails if the served header drops the directives the blog MDX renderer requires —
 * the exact divergence (config keeps it, header drops it) that caused the 2026-06-29 /blog outage.
 * See [TST1f]: test observable output, not internal directive lists.
 */

import { buildCspHeader } from "@/lib/middleware/csp-header";
import { CSP_DIRECTIVES } from "@/config/csp";

/**
 * Returns the full serialized directive segment for `directive` — including the directive name, e.g.
 * "script-src 'self' 'unsafe-inline' ..." — or "" when the directive is absent from the header.
 */
function getDirective(header: string, directive: string): string {
  const match = header.split("; ").find((part) => part.startsWith(`${directive} `));
  return match ?? "";
}

describe("buildCspHeader (emitted CSP header)", () => {
  it("serves 'unsafe-eval' in script-src so blog MDX client hydration is not blocked", async () => {
    const header = await buildCspHeader();
    const scriptSrc = getDirective(header, "script-src");

    expect(scriptSrc).not.toBe("");
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it("emits a script-src that mirrors the canonical CSP_DIRECTIVES.scriptSrc (no per-env subtraction)", async () => {
    const header = await buildCspHeader();
    const scriptSrc = getDirective(header, "script-src");

    // Bind to the canonical owner ([SS1]): every source in CSP_DIRECTIVES.scriptSrc must appear in the
    // served header. A regression that filters the list in the header builder (the original outage shape)
    // would drop one and fail here, and sources added to the canonical list are covered automatically.
    for (const source of CSP_DIRECTIVES.scriptSrc) {
      expect(scriptSrc).toContain(source);
    }
  });
});
