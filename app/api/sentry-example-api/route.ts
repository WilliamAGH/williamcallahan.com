import { NextResponse } from "next/server"; // eslint-disable-line @typescript-eslint/no-unused-vars

export const dynamic = "force-dynamic";
class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}
// A faulty API route to test Sentry's error monitoring
export function GET() {
  // This route intentionally throws an error to test Sentry integration
  throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");

  // Note: The following return is unreachable and serves as documentation only
  // In a normal route, this would return: NextResponse.json({ data: "Testing Sentry Error..." })
}
