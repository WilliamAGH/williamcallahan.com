/**
 * Mock for static image imports (PNG, JPG, etc.)
 *
 * Next.js's nextJest wrapper provides a default file mock with 40x40 dimensions,
 * which fails OpenGraph validation (minimum 144x144). This mock returns dimensions
 * that satisfy OG validation requirements while still being recognizable as a mock.
 */
module.exports = {
  src: "/test-image-stub.png",
  height: 1100,
  width: 2100,
  blurDataURL:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};
