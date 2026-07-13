import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import coverImageMap from "@/data/blog/cover-image-map.json";
import { blogFrontmatterSchema } from "@/types/schemas/blog-frontmatter";

describe("blog cover image manifest", () => {
  it("contains an entry for every local MDX cover image", () => {
    const postsDir = path.join(process.cwd(), "data", "blog", "posts");
    const files = fs.readdirSync(postsDir).filter((file) => file.endsWith(".mdx"));

    const missing: string[] = [];

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const frontmatter = blogFrontmatterSchema.parse(matter(raw).data);
      const coverImage = frontmatter.coverImage;
      if (coverImage?.startsWith("/images/posts/")) {
        const baseName = path.basename(coverImage).replace(/\.[^.]+$/, "");
        if (!Object.hasOwn(coverImageMap, baseName)) {
          missing.push(`${coverImage} (${file})`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
