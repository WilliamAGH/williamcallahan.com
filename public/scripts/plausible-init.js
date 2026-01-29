window.plausible =
  window.plausible ||
  ((...args) => {
    // Initialize queue if it doesn't exist
    if (!window.plausible.q) {
      window.plausible.q = [];
    }

    // Defensive push - handle frozen or read-only arrays
    // This fixes iOS Safari 14.4 compatibility where arrays may be frozen
    try {
      window.plausible.q.push(args);
    } catch {
      // If push fails (frozen array), create a new array with existing items plus new one
      // Use concat for better iOS Safari compatibility
      if (Array.isArray(window.plausible.q)) {
        window.plausible.q = window.plausible.q.concat([args]);
      } else {
        // Fallback: reinitialize if something went very wrong
        window.plausible.q = [args];
      }
    }
  });
