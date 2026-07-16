/** Terminal navigation behavior and help metadata. */

export const sections = {
  home: { path: "/", helpGroup: "navigate", searchScope: null },
  investments: {
    path: "/investments",
    helpGroup: "navigate",
    searchScope: "investments",
  },
  experience: { path: "/experience", helpGroup: "navigate", searchScope: "experience" },
  education: { path: "/education", helpGroup: "navigate", searchScope: "education" },
  projects: { path: "/projects", helpGroup: "navigate", searchScope: "projects" },
  blog: { path: "/blog", helpGroup: "navigate", searchScope: "blog" },
  bookmarks: { path: "/bookmarks", helpGroup: "navigate", searchScope: "bookmarks" },
  books: { path: "/books", helpGroup: "navigate", searchScope: "books" },
  thoughts: { path: "/thoughts", helpGroup: "navigate", searchScope: "thoughts" },
  aventure: { path: "/experience#aventure", helpGroup: "quick-jump", searchScope: null },
  tsbank: { path: "/experience#tsbank", helpGroup: "quick-jump", searchScope: null },
  seekinvest: { path: "/experience#seekinvest", helpGroup: "quick-jump", searchScope: null },
  "callahan-financial": {
    path: "/experience#callahan-financial",
    helpGroup: "quick-jump",
    searchScope: null,
  },
  "mutual-first": {
    path: "/experience#mutual-first",
    helpGroup: "quick-jump",
    searchScope: null,
  },
  morningstar: {
    path: "/experience#morningstar",
    helpGroup: "quick-jump",
    searchScope: null,
  },
  techstars: {
    path: "/experience#techstars",
    helpGroup: "quick-jump",
    searchScope: null,
  },
} as const;

export function isSectionKey(value: string): value is keyof typeof sections {
  return Object.hasOwn(sections, value);
}

function helpCommands(group: "navigate" | "quick-jump"): string {
  return Object.entries(sections)
    .filter(([, section]) => section.helpGroup === group)
    .map(([command]) => command)
    .join("  ");
}

export const terminalNavigationHelp = {
  navigate: helpCommands("navigate"),
  quickJumps: helpCommands("quick-jump"),
} as const;
