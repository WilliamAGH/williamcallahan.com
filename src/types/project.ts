import type { RegistryLink } from "./schemas/registry-link";

export interface Project {
  /**
   * Stable unique identifier for the project. Persistence identity for AI
   * analysis and DB rows — never derive it from the display name and never
   * rename it casually: renames orphan persisted content keyed by the old id.
   */
  id: string;
  name: string;
  description: string;
  shortSummary: string; // Short summary for concise display
  url: string;
  /** Optional GitHub repository URL */
  githubUrl?: string;
  /**
   * S3 object key for the project screenshot, e.g.
   * "images/projects/book-finder-findmybook-net.png"
   */
  imageKey: string;
  tags?: string[]; // Optional tags
  /**
   * Primary technologies used to build the project. Displayed as a "Tech Stack"
   * section on project cards. Keep concise, human-friendly labels such as
   * "Next.js", "TypeScript", "PostgreSQL", etc.
   */
  techStack?: string[];
  /** Optional note/disclaimer surfaced alongside the project description */
  note?: string;
  /** Flag projects that should appear on the CV page */
  cvFeatured?: boolean;
  /**
   * Optional links to package registries (npm, PyPI, VS Code marketplace, etc.)
   * where this project is distributed.
   */
  registryLinks?: RegistryLink[];
}
