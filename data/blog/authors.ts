import type { Author } from "../../types/blog";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

export const authors: Record<string, Author> = {
  "william-callahan": {
    id: "william-callahan",
    name: "William Callahan",
    avatar: getStaticImageUrl("/images/william.jpeg"),
    bio: "Software engineer and entrepreneur based in San Francisco.",
  },
};
