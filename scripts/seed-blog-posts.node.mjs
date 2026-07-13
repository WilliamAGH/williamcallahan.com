#!/usr/bin/env node
/**
 * Seed blog_posts from validated MDX frontmatter.
 *
 * This script runs under Node.js; `tsx` registers the repository TypeScript
 * resolver only for the canonical database mutation import.
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { blogPostInputSchema } from "../src/types/schemas/blog-frontmatter.ts";

const PREFIX = "[seed-blog-posts]";

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function readBlogPostInputs(postsDirectory, fileNames) {
  return Promise.all(
    fileNames.map(async (fileName) => {
      const source = await fs.readFile(path.join(postsDirectory, fileName), "utf8");
      const { content, data } = matter(source);
      return blogPostInputSchema.parse({ frontmatter: data, rawContent: content });
    }),
  );
}

async function upsertValidatedBlogPosts(posts) {
  const { register } = await import("tsx/esm/api");
  const unregister = register({ tsconfig: "./tsconfig.json" });
  let closeDatabaseConnection;

  try {
    const database = await import("../src/lib/db/connection.ts");
    closeDatabaseConnection = database.closeDatabaseConnection;
    const { upsertBlogPosts } = await import("../src/lib/db/mutations/blog-posts.ts");
    return await upsertBlogPosts(posts);
  } finally {
    try {
      if (closeDatabaseConnection !== undefined) await closeDatabaseConnection();
    } finally {
      await unregister();
    }
  }
}

async function run() {
  const postsDirectory = path.join(process.cwd(), "data/blog/posts");
  const directoryEntries = await fs.readdir(postsDirectory);
  const fileNames = directoryEntries.filter((fileName) => fileName.endsWith(".mdx")).toSorted();
  const posts = await readBlogPostInputs(postsDirectory, fileNames);

  console.log(`${PREFIX} Found ${posts.length} MDX files`);
  if (hasFlag("--dry-run")) {
    for (const { frontmatter } of posts) {
      console.log(`  ${frontmatter.slug}: ${frontmatter.title}`);
    }
    console.log(`${PREFIX} Dry run complete.`);
    return;
  }

  const upserted = await upsertValidatedBlogPosts(posts);
  console.log(`${PREFIX} Upserted ${upserted} blog posts`);
}

await run();
