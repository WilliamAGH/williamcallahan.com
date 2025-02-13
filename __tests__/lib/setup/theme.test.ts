import { THEMES, THEME_CONFIG, THEME_COLORS, DARK_SCHEME } from '@/types/theme';

describe('Theme System', () => {
  let matchMedia: jest.SpyInstance;
  let localStorage: jest.SpyInstance;

  beforeEach(() => {
    // Mock matchMedia
    matchMedia = jest.spyOn(window, 'matchMedia');
    // Mock localStorage
    localStorage = jest.spyOn(window.localStorage, 'getItem');
  });

  afterEach(() => {
    matchMedia.mockRestore();
    localStorage.mockRestore();
    // Clean up theme attributes
    document.documentElement.removeAttribute(THEME_CONFIG.DATA_ATTRIBUTES.READY);
    document.documentElement.removeAttribute(THEME_CONFIG.DATA_ATTRIBUTES.LOADED);
    document.documentElement.removeAttribute(THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED);
    document.documentElement.classList.remove('dark');
    // Clean up CSS variables
    document.documentElement.style.removeProperty(THEME_CONFIG.CSS_VARS.BACKGROUND);
    document.documentElement.style.removeProperty(THEME_CONFIG.CSS_VARS.FOREGROUND);
  });

  it('should respect system dark mode preference by default', () => {
    // Mock system dark mode
    matchMedia.mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));
    // Mock no stored preference
    localStorage.mockReturnValue(null);

    // Run theme initialization script
    const script = document.createElement('script');
    script.textContent = `
      // Get stored theme or fall back to system preference
      const theme = localStorage.getItem('${THEME_CONFIG.STORAGE_KEY}') || '${THEME_CONFIG.DEFAULT_THEME}';

      // Check if dark mode should be applied
      const systemPrefersDark = window.matchMedia('${DARK_SCHEME}').matches;
      const isDark = theme === '${THEMES.DARK}' ||
        (theme === '${THEMES.SYSTEM}' && systemPrefersDark);

      // Set theme colors
      const colors = isDark ? ${JSON.stringify(THEME_COLORS.DARK)} : ${JSON.stringify(THEME_COLORS.LIGHT)};
      document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.BACKGROUND}', colors.BACKGROUND);
      document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.FOREGROUND}', colors.FOREGROUND);

      // Apply theme immediately
      document.documentElement.classList[isDark ? 'add' : 'remove']('dark');
    `;
    document.body.appendChild(script);

    // Verify dark mode was applied
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND)).toBe(THEME_COLORS.DARK.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND)).toBe(THEME_COLORS.DARK.FOREGROUND);
  });

  it('should respect system light mode preference by default', () => {
    // Mock system light mode
    matchMedia.mockImplementation(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));
    // Mock no stored preference
    localStorage.mockReturnValue(null);

    // Run theme initialization
    const script = document.createElement('script');
    script.textContent = `
      const theme = localStorage.getItem('${THEME_CONFIG.STORAGE_KEY}') || '${THEME_CONFIG.DEFAULT_THEME}';
      const systemPrefersDark = window.matchMedia('${DARK_SCHEME}').matches;
      const isDark = theme === '${THEMES.DARK}' ||
        (theme === '${THEMES.SYSTEM}' && systemPrefersDark);

      // Set theme colors
      const colors = isDark ? ${JSON.stringify(THEME_COLORS.DARK)} : ${JSON.stringify(THEME_COLORS.LIGHT)};
      document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.BACKGROUND}', colors.BACKGROUND);
      document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.FOREGROUND}', colors.FOREGROUND);

      // Apply theme
      document.documentElement.classList[isDark ? 'add' : 'remove']('dark');
    `;
    document.body.appendChild(script);

    // Verify light mode was applied
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND)).toBe(THEME_COLORS.LIGHT.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND)).toBe(THEME_COLORS.LIGHT.FOREGROUND);
  });

  it('should handle localStorage errors gracefully', () => {
    // Mock localStorage error
    localStorage.mockImplementation(() => {
      throw new Error('localStorage disabled');
    });

    // Run theme initialization
    const script = document.createElement('script');
    script.textContent = `
      try {
        const theme = localStorage.getItem('${THEME_CONFIG.STORAGE_KEY}') || '${THEME_CONFIG.DEFAULT_THEME}';
        const systemPrefersDark = window.matchMedia('${DARK_SCHEME}').matches;
        const isDark = theme === '${THEMES.DARK}' ||
          (theme === '${THEMES.SYSTEM}' && systemPrefersDark);

        // Set theme colors
        const colors = isDark ? ${JSON.stringify(THEME_COLORS.DARK)} : ${JSON.stringify(THEME_COLORS.LIGHT)};
        document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.BACKGROUND}', colors.BACKGROUND);
        document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.FOREGROUND}', colors.FOREGROUND);

        document.documentElement.classList[isDark ? 'add' : 'remove']('dark');
      } catch (e) {
        document.documentElement.classList.remove('dark');
        const colors = ${JSON.stringify(THEME_COLORS.LIGHT)};
        document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.BACKGROUND}', colors.BACKGROUND);
        document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.FOREGROUND}', colors.FOREGROUND);
        document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTES.READY}', 'error');
        document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED}', '${THEME_CONFIG.FALLBACK_THEME}');
      }
    `;
    document.body.appendChild(script);

    // Verify fallback was applied
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute(THEME_CONFIG.DATA_ATTRIBUTES.READY)).toBe('error');
    expect(document.documentElement.getAttribute(THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED)).toBe(THEME_CONFIG.FALLBACK_THEME);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND)).toBe(THEME_COLORS.LIGHT.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND)).toBe(THEME_COLORS.LIGHT.FOREGROUND);
  });
});
