/* eslint-disable @next/next/no-img-element */
import type { MockImageProps } from "@/types/test";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, jest } from "@jest/globals";
import "@testing-library/jest-dom";

// Note: We are avoiding jest-dom matchers due to potential environment conflicts
// import { toHaveAttribute } from '@testing-library/jest-dom/matchers';
// expect.extend({ toHaveAttribute });

// Mock next/image BEFORE importing the component under test
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, priority, layout, objectFit, fill, ...restProps }: MockImageProps) => {
    const effectiveLayout = layout ?? (fill ? "fill" : undefined);
    const priorityAttr = priority ? { "data-priority": "true" } : {};
    return (
      // biome-ignore lint/performance/noImgElement: This is a test mock for Next.js Image component
      <img
        src={src}
        alt={alt}
        data-testid="next-image-mock"
        data-layout={effectiveLayout}
        data-object-fit={objectFit}
        {...priorityAttr}
        {...restProps}
      />
    );
  },
}));

// Static import after mocking
// import Image from 'next/image'; // This import is no longer needed

import { LogoImage } from "../../../components/ui/logo-image.client";

describe("LogoImage Conditional Rendering", () => {
  const regularUrlProps = {
    src: "https://example.com/logo.png",
    width: 100,
    height: 100,
  };

  const dataUrlProps = {
    src: "data:image/svg+xml;base64,abc123", // Use a sample SVG data URL
    width: 50,
    height: 50,
  };

  describe("Regular URL Rendering (uses next/image)", () => {
    it("renders next/image mock and wrapper with correct props", () => {
      render(<LogoImage {...regularUrlProps} />);
      // Check the next/image mock img tag
      const img = screen.getByTestId("next-image-mock");
      expect(img).toBeInTheDocument();
      // Use basic attribute checks instead of toHaveAttribute
      expect(img.getAttribute("src")).toBe(regularUrlProps.src);
      expect(img.getAttribute("alt")).toBe("Company Logo"); // Default alt
      // The mock sets data-layout and data-object-fit attributes
      expect(img.getAttribute("data-object-fit")).toBeNull(); // attribute should be absent
      expect(img.getAttribute("data-priority")).toBe("false");

      // Ensure className is applied to img element itself (no wrapper in component)
      expect(img.classList.contains("object-contain")).toBe(true);
    });

    it("passes priority prop to next/image mock", () => {
      render(<LogoImage {...regularUrlProps} priority={true} />);
      // Use basic attribute check
      expect(screen.getByTestId("next-image-mock").hasAttribute("data-priority")).toBe(true);
      expect(screen.getByTestId("next-image-mock").getAttribute("data-priority")).toBe("true");
    });

    it("applies custom className to the component wrapper", () => {
      render(<LogoImage {...regularUrlProps} className="custom-class" />);
      const img = screen.getByTestId("next-image-mock");
      expect(img.classList.contains("custom-class")).toBe(true);
      expect(img.classList.contains("object-contain")).toBe(true);
    });
  });

  describe("Data URL Rendering (uses plain <img>)", () => {
    it("renders plain img tag with correct props", () => {
      render(<LogoImage {...dataUrlProps} />);
      // Check if the plain img tag was rendered (and not the next/image mock)
      expect(screen.queryByTestId("next-image-mock")).not.toBeInTheDocument();
      expect(screen.queryByTestId("logo-image-wrapper")).not.toBeInTheDocument(); // Wrapper shouldn't exist for plain img

      const img = screen.getByRole("img"); // Get the plain img tag
      expect(img).toBeInTheDocument();
      // Use basic attribute checks
      expect(img.getAttribute("src")).toBe(dataUrlProps.src);
      expect(img.getAttribute("alt")).toBe("Company Logo"); // Default alt
      expect(img.getAttribute("width")).toBe(dataUrlProps.width.toString());
      expect(img.getAttribute("height")).toBe(dataUrlProps.height.toString());
      expect(img.getAttribute("loading")).toBe("lazy");
      // Use basic class check
      expect(img.classList.contains("object-contain")).toBe(true); // Default class
    });

    it("applies custom className to the plain img tag", () => {
      render(<LogoImage {...dataUrlProps} className="custom-img-class" />);
      const img = screen.getByRole("img");
      // Use basic class checks
      expect(img.classList.contains("object-contain")).toBe(true);
      expect(img.classList.contains("custom-img-class")).toBe(true);
    });

    it("ignores priority prop for plain img tag", () => {
      // Priority is a next/image specific prop
      render(<LogoImage {...dataUrlProps} priority={true} />);
      const img = screen.getByRole("img");
      // Use basic attribute checks for absence
      expect(img.hasAttribute("priority")).toBe(false);
      expect(img.hasAttribute("data-priority")).toBe(false);
    });
  });
});
