export interface Project {
  /** Unique identifier for the project (typically same as name) */
  id?: string;
  name: string;
  description: string;
  shortSummary: string; // Short summary for concise display
  url: string;
  /**
   * S3 object key for the project screenshot, e.g.
   * "images/projects/book-finder-findmybook-net.png"
   */
  imageKey: string;
  tags?: string[]; // Optional tags
}
