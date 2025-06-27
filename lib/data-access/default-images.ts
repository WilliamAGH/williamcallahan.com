/**
 * Default Images with S3 CDN URLs
 * 
 * Provides access to default images stored in S3
 */

import { getStaticImageUrl } from "./static-images";

/**
 * Get default images with S3 CDN URLs
 */
export function getDefaultImages() {
  return {
    /** Default OpenGraph logo for the site owner */
    OPENGRAPH_LOGO: getStaticImageUrl("/images/william-callahan-san-francisco.png"),
    /** Placeholder image for companies without logos */
    COMPANY_PLACEHOLDER: getStaticImageUrl("/images/company-placeholder.svg"),
  };
}

/**
 * Get the default OpenGraph logo URL
 */
export function getDefaultOpenGraphLogo(): string {
  return getStaticImageUrl("/images/william-callahan-san-francisco.png");
}

/**
 * Get the company placeholder image URL
 */
export function getCompanyPlaceholder(): string {
  return getStaticImageUrl("/images/company-placeholder.svg");
}