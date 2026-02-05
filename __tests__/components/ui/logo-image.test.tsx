import { vi, type MockInstance } from "vitest";
import type { MockImageProps } from "@/types/test";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock cdn-utils to ensure CDN URL detection works in tests
// CDN URLs should flow directly to Next.js Image (not proxied)
vi.mock("@/lib/utils/cdn-utils", () => ({
  getOptimizedImageSrc: (src: string | null | undefined) => {
    if (!src) return undefined;
    // CDN URLs pass through directly
    if (src.startsWith("https://s3-storage.callahan.cloud")) return src;
    // Data URLs pass through
    if (src.startsWith("data:")) return src;
    // Local paths pass through
    if (src.startsWith("/")) return src;
    // External URLs get proxied
    return `/api/cache/images?url=${encodeURIComponent(src)}&width=100`;
  },
  shouldBypassOptimizer: (src: string | undefined) => {
    if (!src) return false;
    return (
      src.startsWith("/api/cache/images") ||
      src.startsWith("/api/assets/") ||
      src.startsWith("data:")
    );
  },
  getCdnConfigFromEnv: () => ({
    cdnBaseUrl: "https://s3-storage.callahan.cloud",
    s3BucketName: undefined,
    s3ServerUrl: undefined,
  }),
  isOurCdnUrl: (url: string) => url?.startsWith("https://s3-storage.callahan.cloud") ?? false,
}));

// Mock next/image BEFORE importing the component under test
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    priority,
    layout,
    objectFit,
    fill,
    unoptimized,
    ...restProps
  }: MockImageProps) => {
    const effectiveLayout = layout ?? (fill ? "fill" : undefined);
    const dataPriority = restProps["data-priority"] || (priority ? "true" : "false");
    return (
      /* biome-ignore lint/performance/noImgElement: mock next/image with <img> in tests */
      <img
        data-testid="next-image-mock"
        src={src}
        alt={alt}
        data-layout={effectiveLayout}
        data-object-fit={objectFit}
        data-fill={fill ? "true" : "false"}
        data-priority={dataPriority}
        data-unoptimized={unoptimized ? "true" : "false"}
        {...restProps}
      />
    );
  },
}));

// Static import after mocking
// import Image from 'next/image'; // This import is no longer needed

import { LogoImage } from "../../../src/components/ui/logo-image.client";

describe("LogoImage Conditional Rendering", () => {
  const regularUrlProps = {
    src: "https://example.com/logo.png",
    width: 100,
    height: 100,
    alt: "Company Logo",
  };

  // Expected proxied URL for regularUrlProps - the component transforms external URLs
  const expectedRegularProxiedUrl = `/api/cache/images?url=${encodeURIComponent(regularUrlProps.src)}&width=${regularUrlProps.width}`;

  const dataUrlProps = {
    src: "data:image/svg+xml;base64,abc123", // Use a sample SVG data URL
    width: 50,
    height: 50,
    alt: "Company Logo",
  };
  const cdnUrlProps = {
    src: "https://s3-storage.callahan.cloud/images/logos/aescape_com_google_ae8818cb.png",
    width: 96,
    height: 32,
    alt: "Company Logo",
  };
  // CDN URLs flow directly to Next.js Image (not proxied) per image optimization canonicalization
  // See docs/architecture/image-handling.md - Image Optimization Decision Matrix
  const expectedCdnDirectUrl = cdnUrlProps.src;

  describe("Regular URL Rendering (uses next/image)", () => {
    it("renders next/image mock and wrapper with correct props", () => {
      render(<LogoImage {...regularUrlProps} />);
      // Get all images and find the main one (not placeholder)
      // The component proxies external URLs through /api/cache/images
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === expectedRegularProxiedUrl);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      expect(mainImage).toBeInTheDocument();
      // Use basic attribute checks instead of toHaveAttribute
      expect(mainImage.getAttribute("src")).toBe(expectedRegularProxiedUrl);
      expect(mainImage.getAttribute("alt")).toBe("Company Logo"); // Default alt
      // The mock sets data-layout and data-object-fit attributes
      expect(mainImage.getAttribute("data-object-fit")).toBeNull(); // attribute should be absent
      expect(mainImage.getAttribute("data-priority")).toBe("false");

      // Ensure className is applied to img element itself (no wrapper in component)
      expect(mainImage.classList.contains("object-contain")).toBe(true);
    });

    it("passes priority prop to next/image mock", () => {
      render(<LogoImage {...regularUrlProps} priority={true} />);
      // Get all images and find the main one - the component proxies external URLs
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === expectedRegularProxiedUrl);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      // Use basic attribute check
      expect(mainImage.hasAttribute("data-priority")).toBe(true);
      expect(mainImage.getAttribute("data-priority")).toBe("true");
    });

    it("applies custom className to the component wrapper", () => {
      render(<LogoImage {...regularUrlProps} className="custom-class" />);
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === expectedRegularProxiedUrl);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      expect(mainImage.classList.contains("custom-class")).toBe(true);
      expect(mainImage.classList.contains("object-contain")).toBe(true);
    });
  });

  describe("Data URL Rendering (uses next/image)", () => {
    it("renders next/image for data URLs with correct props", () => {
      render(<LogoImage {...dataUrlProps} />);
      // Check if next/image was rendered for data URL
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === dataUrlProps.src);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      expect(mainImage).toBeInTheDocument();

      // Check props
      expect(mainImage).toHaveAttribute("src", dataUrlProps.src);
      expect(mainImage).toHaveAttribute("alt", "Company Logo"); // Default alt
      expect(mainImage).toHaveAttribute("width", dataUrlProps.width.toString());
      expect(mainImage).toHaveAttribute("height", dataUrlProps.height.toString());
      expect(mainImage).toHaveAttribute("data-priority", "false");
      // Check classes
      expect(mainImage).toHaveClass("object-contain");
    });

    it("applies custom className to next/image for data URLs", () => {
      render(<LogoImage {...dataUrlProps} className="custom-img-class" />);
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === dataUrlProps.src);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      // Check classes
      expect(mainImage).toHaveClass("object-contain");
      expect(mainImage).toHaveClass("custom-img-class");
    });

    it("handles priority prop for data URLs with next/image", () => {
      render(<LogoImage {...dataUrlProps} priority={true} />);
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === dataUrlProps.src);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      // Check priority attribute is set correctly
      expect(mainImage).toHaveAttribute("data-priority", "true");
    });
  });

  describe("Logo retry handling", () => {
    let fetchSpy: MockInstance;

    beforeEach(() => {
      // Don't use fake timers for this test - fetch is called synchronously on error
      // and waitFor needs real timers to work properly
      if (typeof global.fetch !== "function") {
        // @ts-expect-error - fetch mock
        global.fetch = () => Promise.resolve({ ok: true } as Response);
      }
      fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);
    });

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    it("calls /api/logo with canonical domain when CDN key fails", async () => {
      render(<LogoImage {...cdnUrlProps} />);
      const images = screen.getAllByTestId("next-image-mock");
      // CDN URLs flow directly to Next.js Image (not proxied)
      const mainImage = images.find((img) => img.getAttribute("src") === expectedCdnDirectUrl);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      fireEvent.error(mainImage);

      // fetch is called synchronously on error, so no need to wait
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const requestedUrl = fetchSpy.mock.calls[0]?.[0];
      expect(typeof requestedUrl).toBe("string");
      if (typeof requestedUrl !== "string")
        throw new Error("Fetch was not invoked with a URL string");

      const parsed = new URL(requestedUrl, "http://localhost");
      expect(parsed.pathname).toBe("/api/logo");
      expect(parsed.searchParams.get("website")).toBe("aescape.com");
      expect(parsed.searchParams.get("forceRefresh")).toBe("true");
    });
  });
});
