"use client";

import * as Sentry from "@sentry/nextjs"; // Restore import
import NextError from "next/error";
import { useEffect } from "react"; // Restore import

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error); // Restore Sentry call
  }, [error]);

  // Remove console.error added for debugging
  // console.error("Global Error Boundary Caught:", error);

  return (
    <html>
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
