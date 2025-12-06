import type { Author } from "../../types/blog";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

export const authors: Record<string, Author> = {
  "william-callahan": {
    id: "william-callahan",
    name: "William Callahan",
    avatar: getStaticImageUrl("/images/william.jpeg"),
    bio: [
      {
        type: "text",
        value: "Software engineer and founder with a background in finance and tech. Currently building ",
      },
      {
        type: "link",
        label: "aVenture.vc",
        href: "https://aventure.vc",
      },
      {
        type: "text",
        value: ", a platform for researching private companies. Based in San Francisco.",
      },
    ],
  },
};
