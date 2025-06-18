/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
window.plausible =
  window.plausible ||
  ((...args) => {
    window.plausible.q = window.plausible.q || [];
    window.plausible.q.push(args);
  });
