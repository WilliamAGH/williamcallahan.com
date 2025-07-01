/**
 * OpenGraph Validation Types
 * @module types/seo/validation
 */

export interface OGImageValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export interface OGImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface OGMetadata {
  title: string;
  description: string;
  url: string;
  type: string;
  images: OGImage[];
  siteName?: string;
  locale?: string;
}

/**
 * Type adapter to convert Next.js OpenGraph types to our validation types
 */
export function adaptNextOpenGraphToOGMetadata(openGraph: unknown): OGMetadata | null {
  if (!openGraph || typeof openGraph !== 'object') {
    return null;
  }

  const og = openGraph as Record<string, unknown>;

  // Extract required fields with type guards
  const title = typeof og.title === 'string' ? og.title : '';
  const description = typeof og.description === 'string' ? og.description : '';
  const url = typeof og.url === 'string' ? og.url : '';
  const type = typeof og.type === 'string' ? og.type : 'website';
  const siteName = typeof og.siteName === 'string' ? og.siteName : undefined;
  const locale = typeof og.locale === 'string' ? og.locale : undefined;

  // Handle images array
  const images: OGImage[] = [];
  if (Array.isArray(og.images)) {
    for (const img of og.images) {
      if (img && typeof img === 'object') {
        const imgObj = img as Record<string, unknown>;
        if (typeof imgObj.url === 'string') {
          images.push({
            url: imgObj.url,
            width: typeof imgObj.width === 'number' ? imgObj.width : undefined,
            height: typeof imgObj.height === 'number' ? imgObj.height : undefined,
            alt: typeof imgObj.alt === 'string' ? imgObj.alt : undefined,
          });
        }
      }
    }
  }

  return {
    title,
    description,
    url,
    type,
    images,
    siteName,
    locale,
  };
}
