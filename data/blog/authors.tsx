import type { Author } from "../../types/blog";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

export const authors: Record<string, Author> = {
  "william-callahan": {
    id: "william-callahan",
    name: "William Callahan",
    avatar: getStaticImageUrl("/images/william.jpeg"),
    bio: (
      <>
        Software engineer and founder with a background in finance and tech. Currently building{" "}
        <a
          href="https://aventure.vc"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          aVenture.vc
        </a>
        , a platform for researching private companies. Based in San Francisco.
      </>
    ),
  },
};
