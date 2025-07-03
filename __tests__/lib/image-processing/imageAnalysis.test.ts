// Jest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
import {
  analyzeLogo,
  invertLogo,
  doesLogoNeedInversion,
  analyzeImage, // Include legacy export for coverage
  type LogoBrightnessAnalysis, // Import the type
  type LogoInversion, // Import the type
} from "@/lib/image-handling/image-analysis";

// TODO(wasm-image): Sharp was removed to fix memory leaks. These tests now expect
// stubbed values until we implement a WASM-based image analysis pipeline.

/**
 * Test data constants for stubbed image analysis
 * These values now include entropy-based brightness estimation
 */
const TEST_DATA = {
  // Enhanced return values from image-analysis.ts with entropy analysis
  STUB_BRIGHTNESS: 240,
  STUB_IS_LIGHT_COLORED: true,
  STUB_NEEDS_INVERSION_LIGHT: false,
  STUB_NEEDS_INVERSION_DARK: true,
  STUB_HAS_TRANSPARENCY: false,
  STUB_FORMAT: "unknown",
  STUB_DIMENSIONS: { width: 0, height: 0 },
  STUB_LEGACY_BRIGHTNESS: 240 / 255,
} as const;

describe("Logo Analysis Module", () => {
  describe("analyzeLogo", () => {
    it("should return stubbed values for logo analysis", async () => {
      // TODO(wasm-image): This test expects stubbed values until WASM implementation
      const testBuffer = Buffer.from([0]);
      const result: LogoBrightnessAnalysis = await analyzeLogo(testBuffer);

      // Assert the stubbed values from the current implementation
      expect(result.averageBrightness).toBe(TEST_DATA.STUB_BRIGHTNESS);
      expect(result.isLightColored).toBe(TEST_DATA.STUB_IS_LIGHT_COLORED);
      expect(result.needsInversionInLightTheme).toBe(TEST_DATA.STUB_NEEDS_INVERSION_LIGHT);
      expect(result.needsInversionInDarkTheme).toBe(TEST_DATA.STUB_NEEDS_INVERSION_DARK);
      expect(result.hasTransparency).toBe(TEST_DATA.STUB_HAS_TRANSPARENCY);
      expect(result.format).toBe(TEST_DATA.STUB_FORMAT);
      expect(result.dimensions).toEqual(TEST_DATA.STUB_DIMENSIONS);
    });
  });

  describe("invertLogo", () => {
    it("should return original buffer (no-op stub)", async () => {
      // TODO(wasm-image): This is a no-op stub until WASM implementation
      const testBuffer = Buffer.from([0]);
      const result = await invertLogo(testBuffer);
      expect(result).toBe(testBuffer); // Should return the original buffer
    });

    it("should return original buffer when preserveTransparency is requested", async () => {
      // TODO(wasm-image): This is a no-op stub until WASM implementation
      const testBuffer = Buffer.from([0]);
      const result = await invertLogo(testBuffer, true);
      expect(result).toBe(testBuffer); // Should return the original buffer
    });
  });

  describe("doesLogoNeedInversion", () => {
    it("should respect brightness thresholds when deciding inversion", async () => {
      const testBuffer = Buffer.from([0]);
      const resultLight = await doesLogoNeedInversion(testBuffer, false);
      const resultDark = await doesLogoNeedInversion(testBuffer, true);

      expect(resultLight).toBe(true);
      expect(resultDark).toBe(false);
    });
  });

  describe("Legacy API Compatibility", () => {
    it("should maintain backwards compatibility with analyzeImage", async () => {
      // TODO(wasm-image): This test expects stubbed values until WASM implementation
      const testBuffer = Buffer.from([0]);
      const result: LogoInversion = await analyzeImage(testBuffer);

      // Assert the stubbed values from the legacy API
      expect(result.brightness).toBe(TEST_DATA.STUB_LEGACY_BRIGHTNESS);
      expect(result.needsDarkInversion).toBe(false);
      expect(result.needsLightInversion).toBe(true);
      expect(result.hasTransparency).toBe(false);
      expect(result.format).toBe(TEST_DATA.STUB_FORMAT);
      expect(result.dimensions).toEqual(TEST_DATA.STUB_DIMENSIONS);
    });
  });
});
