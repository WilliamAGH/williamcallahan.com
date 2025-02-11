// Immediately set the theme before any content loads
(function() {
  // Constants
  const STORAGE_KEY = 'theme';
  const DARK_SCHEME = '(prefers-color-scheme: dark)';
  const DEFAULT_THEME = 'system';
  const RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 100;

  // Performance tracking
  const perf = {
    start: () => window.performance && window.performance.mark('theme-init-start'),
    end: () => {
      if (window.performance && window.performance.mark) {
        window.performance.mark('theme-init-end');
        window.performance.measure('theme-init', 'theme-init-start', 'theme-init-end');
      }
    }
  };

  perf.start();
  // Performance mark for debugging
  if (window.performance && window.performance.mark) {
    window.performance.mark('theme-init-start');
  }

  // State management
  let currentTheme = DEFAULT_THEME;
  let mediaQuery = null;
  let retryCount = 0;

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      console.warn('LocalStorage not available:', e);
      return null
    }
  }

  function getSystemTheme() {
    try {
      return window.matchMedia(DARK_SCHEME).matches ? 'dark' : 'light'
    } catch (e) {
      console.warn('MediaQuery not supported:', e);
      return 'light' // Safe fallback
    }
  }

  function setTheme(theme, source = 'init') {
    try {
      currentTheme = theme;
      const isDark = theme === 'system' ? getSystemTheme() === 'dark' : theme === 'dark';

      // Apply theme
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }

      // Try to persist theme
      try {
        localStorage.setItem(STORAGE_KEY, theme)
      } catch (e) {
        console.warn('Failed to save theme preference:', e);
      }

      // Log theme changes for debugging
      console.debug(`Theme set to ${theme} (source: ${source}, isDark: ${isDark})`);

      return true;
    } catch (e) {
      console.error('Failed to set theme:', e);
      return false;
    }
  }

  function setupSystemThemeListener() {
    try {
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      }

      mediaQuery = window.matchMedia(DARK_SCHEME);
      const handleSystemThemeChange = (e) => {
        if (currentTheme === 'system') {
          setTheme('system', 'system-change');
        }
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemThemeChange);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleSystemThemeChange);
      }

      // Store cleanup function
      window.__THEME_CLEANUP__ = () => {
        if (mediaQuery) {
          if (mediaQuery.removeEventListener) {
            mediaQuery.removeEventListener('change', handleSystemThemeChange);
          } else if (mediaQuery.removeListener) {
            mediaQuery.removeListener(handleSystemThemeChange);
          }
          mediaQuery = null;
        }
      };
    } catch (e) {
      console.error('Failed to setup system theme listener:', e);
    }
  }

  function initializeTheme() {
    const storedTheme = getStoredTheme();
    const success = setTheme(storedTheme || DEFAULT_THEME, 'initial');

    if (!success && retryCount < RETRY_ATTEMPTS) {
      retryCount++;
      setTimeout(initializeTheme, RETRY_DELAY);
      return;
    }

    setupSystemThemeListener();
    perf.end();
  }

  // Start initialization
  try {
    initializeTheme();
  } catch (e) {
    console.error('Theme initialization failed:', e);
    // Ensure dark mode class is removed in case of error
    document.documentElement.classList.remove('dark');
    perf.end();
  }
})();
