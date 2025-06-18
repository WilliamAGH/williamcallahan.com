import type { ImageProps } from "next/image";

export interface Project {
  name: string;
  description: string;
  shortSummary: string; // Short summary for concise display
  url: string;
  image?: ImageProps["src"]; // Optional image source
  tags?: string[]; // Optional tags
}
