export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description: string;
  tags: string[];
  ogImage?: string;
  dateBookmarked: string;
  datePublished?: string;
  telegramUsername?: string;
}

export interface BookmarkWithPreview extends Bookmark {
  preview: JSX.Element;
}
