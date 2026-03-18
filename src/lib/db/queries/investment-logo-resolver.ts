/**
 * Investment Logo Resolver: resolve a display logo URL for an investment row.
 *
 * Walks the manifest → runtime → placeholder fallback chain and returns a
 * fully-qualified URL suitable for use in <Image> components.
 *
 * @module db/queries/investment-logo-resolver
 */

import { resolveImageUrl } from "@/lib/seo/url-utils";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import { getRuntimeLogoUrl } from "@/lib/data-access/logos";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";

const warnedPlaceholderFallbacks = new Set<string>();

/** Resolve investment logo URL through manifest → runtime → placeholder chain. */
export async function resolveInvestmentLogo(row: {
  logo: string | null;
  logoOnlyDomain: string | null;
  website: string | null;
  name: string;
}): Promise<string | undefined> {
  if (row.logo) return resolveImageUrl(row.logo);

  const effectiveDomain = row.logoOnlyDomain
    ? normalizeDomain(row.logoOnlyDomain)
    : row.website
      ? normalizeDomain(row.website)
      : normalizeDomain(row.name);

  if (effectiveDomain) {
    const manifest = await getLogoFromManifestAsync(effectiveDomain);
    if (manifest?.cdnUrl) return resolveImageUrl(manifest.cdnUrl);

    const runtime = getRuntimeLogoUrl(effectiveDomain, { company: row.name });
    if (runtime) return resolveImageUrl(runtime);
  }

  const fallbackKey = effectiveDomain || row.name;
  if (!warnedPlaceholderFallbacks.has(fallbackKey)) {
    console.warn(
      `[investment-logo-resolver] Falling back to placeholder for "${row.name}" (domain: "${effectiveDomain || "n/a"}").`,
    );
    warnedPlaceholderFallbacks.add(fallbackKey);
  }
  return resolveImageUrl(getCompanyPlaceholder());
}
