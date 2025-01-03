import { generateRobotsTxt } from "../../lib/seo";

/**
 * Generate robots.txt file
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route
 */
export async function GET(): Promise<Response> {
  return new Response(generateRobotsTxt(), {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
