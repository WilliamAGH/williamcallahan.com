export interface Project {
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
