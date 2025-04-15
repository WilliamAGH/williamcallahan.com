import { fixSvgTransform, processSvgTransforms } from 'lib/utils/svg-transform-fix';

describe('SVG Transform Fix Utilities', () => {
  describe('fixSvgTransform', () => {
    it('should return empty string if transform is empty', () => {
      expect(fixSvgTransform('')).toBe('');
    });

    it('should not modify transform strings that already have parentheses', () => {
      const transform = 'translate(10,20)';
      expect(fixSvgTransform(transform)).toBe(transform);
    });

    it('should add parentheses to translate transform', () => {
      expect(fixSvgTransform('translate10,20')).toBe('translate(10,20)');
    });

    it('should add parentheses to scale transform', () => {
      expect(fixSvgTransform('scale0.5')).toBe('scale(0.5)');
    });

    it('should add parentheses to rotate transform', () => {
      expect(fixSvgTransform('rotate45')).toBe('rotate(45)');
    });

    it('should return transform as is if it doesn\'t match known patterns', () => {
      const unknownTransform = 'unknown10,20';
      expect(fixSvgTransform(unknownTransform)).toBe(unknownTransform);
    });
  });

  describe('processSvgTransforms', () => {
    it('should fix a single transform in SVG string', () => {
      const svgString = '<svg><rect transform="translate10,20" /></svg>';
      const expected = '<svg><rect transform="translate(10,20)" /></svg>';

      expect(processSvgTransforms(svgString)).toBe(expected);
    });

    it('should fix multiple transforms in SVG string', () => {
      const svgString = `
        <svg>
          <rect transform="translate10,20" />
          <circle transform="scale0.5" />
          <path transform="rotate45" />
        </svg>
      `;
      const expected = `
        <svg>
          <rect transform="translate(10,20)" />
          <circle transform="scale(0.5)" />
          <path transform="rotate(45)" />
        </svg>
      `;

      expect(processSvgTransforms(svgString)).toBe(expected);
    });

    it('should handle complex SVG with mixed transform attributes', () => {
      const svgString = `
        <svg width="100" height="100">
          <g>
            <rect x="10" y="10" width="50" height="50" transform="translate10,20" />
            <circle cx="50" cy="50" r="25" transform="scale0.5" />
          </g>
          <path d="M10 10 H 90 V 90 H 10 L 10 10" transform="rotate45" />
          <text x="50" y="50" transform="translate(5,5)">Already fixed</text>
        </svg>
      `;

      const result = processSvgTransforms(svgString) as string;

      // Verify each transform individually
      expect(result).toContain('transform="translate(10,20)"');
      expect(result).toContain('transform="scale(0.5)"');
      expect(result).toContain('transform="rotate(45)"');
      expect(result).toContain('transform="translate(5,5)"'); // Should remain unchanged
    });

    it('should not modify transforms that are already correct', () => {
      const svgString = '<svg><rect transform="translate(10,20)" /></svg>';
      expect(processSvgTransforms(svgString)).toBe(svgString);
    });

    it('should handle SVG with multiple identical transform types', () => {
      const svgString = `
        <svg>
          <rect transform="translate10,20" />
          <rect transform="translate30,40" />
        </svg>
      `;
      const expected = `
        <svg>
          <rect transform="translate(10,20)" />
          <rect transform="translate(30,40)" />
        </svg>
      `;

      expect(processSvgTransforms(svgString)).toBe(expected);
    });
  });
});