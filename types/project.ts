import type { ImageProps } from 'next/image';

export interface Project {
  name: string;
  description: string;
  url: string;
  image?: ImageProps['src']; // Optional image source
  tags?: string[]; // Optional tags
}
