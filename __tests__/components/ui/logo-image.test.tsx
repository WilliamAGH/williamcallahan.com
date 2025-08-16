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
    const dataPriority = restProps["data-priority"] || (priority ? "true" : "false");
    return (
      <img
        src={src}
        alt={alt}
        data-layout={effectiveLayout}
        data-object-fit={objectFit}
        data-fill={fill ? "true" : "false"}
        data-priority={dataPriority}
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
      // Get all images and find the main one (not placeholder)
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === regularUrlProps.src);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      expect(mainImage).toBeInTheDocument();
      // Use basic attribute checks instead of toHaveAttribute
      expect(mainImage.getAttribute("src")).toBe(regularUrlProps.src);
      expect(mainImage.getAttribute("alt")).toBe("Company Logo"); // Default alt
      // The mock sets data-layout and data-object-fit attributes
      expect(mainImage.getAttribute("data-object-fit")).toBeNull(); // attribute should be absent
      expect(mainImage.getAttribute("data-priority")).toBe("false");

      // Ensure className is applied to img element itself (no wrapper in component)
      expect(mainImage.classList.contains("object-contain")).toBe(true);
    });

    it("passes priority prop to next/image mock", () => {
      render(<LogoImage {...regularUrlProps} priority={true} />);
      // Get all images and find the main one
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === regularUrlProps.src);
      expect(mainImage).toBeTruthy();

      if (!mainImage) throw new Error("Main image not found");

      // Use basic attribute check
      expect(mainImage.hasAttribute("data-priority")).toBe(true);
      expect(mainImage.getAttribute("data-priority")).toBe("true");
    });

    it("applies custom className to the component wrapper", () => {
      render(<LogoImage {...regularUrlProps} className="custom-class" />);
      const images = screen.getAllByTestId("next-image-mock");
      const mainImage = images.find((img) => img.getAttribute("src") === regularUrlProps.src);
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
});
