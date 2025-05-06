"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Report the error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* Render the default Next.js error page component.
            We pass a generic statusCode (e.g., 0 or 500) as the App Router
            doesn't expose specific status codes for global errors here. */}
        <NextError statusCode={500} title="An error occurred" />
      </body>
    </html>
  );
}
