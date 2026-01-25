export interface Project {
  /** Unique identifier for the project (typically same as name) */
  id?: string;
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
}
