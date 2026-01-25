import React from "react";
import { TextDecoder as PolyfillTextDecoder } from "@sinonjs/text-encoding";
import CvPdfDocument from "@/components/features/cv/CvPdfDocument";
import logger from "@/lib/utils/logger";
import { NO_STORE_HEADERS, preventCaching } from "@/lib/utils/api-utils";
import { type NextRequest } from "next/server";

const ensureWindows1252TextDecoder = (() => {
  let patched = false;
  return (): void => {
    if (patched) {
      return;
    }

    const hasGlobalDecoder = typeof globalThis.TextDecoder !== "undefined";
    const supportsWindows1252 =
      hasGlobalDecoder &&
      (() => {
        try {
          const decoder = new globalThis.TextDecoder("windows-1252");
          decoder.decode(new Uint8Array());
          return true;
        } catch {
          return false;
        }
      })();

    if (!supportsWindows1252) {
      globalThis.TextDecoder = PolyfillTextDecoder as unknown as typeof globalThis.TextDecoder;
    }

    patched = true;
  };
})();

ensureWindows1252TextDecoder();

const rendererModulePromise = (async () => {
  return import("@react-pdf/renderer");
})();

// RFC 7807: `type` is a stable URI that identifies this problem class. It does not
// need to resolve to real content, but must remain consistent so clients can
// detect "CV PDF rendering failed" responses reliably.
const PROBLEM_DETAILS_TYPE = "https://williamcallahan.com/problems/cv-pdf-rendering";

function buildProblemDetails({
  title,
  detail,
  status,
  instance,
  correlationId,
}: {
  title: string;
  detail: string;
  status: number;
  instance: string;
  correlationId: string;
}) {
  return {
    type: PROBLEM_DETAILS_TYPE,
    title,
    detail,
    status,
    instance,
    correlationId,
  } satisfies Record<string, unknown>;
}

export async function GET(request: NextRequest): Promise<Response> {
  preventCaching();
  const { renderToBuffer } = await rendererModulePromise;
  const correlationId = globalThis.crypto.randomUUID();
  const url = new URL(request.url);
  const instance = url.pathname;

  try {
    const pdfBuffer = await renderToBuffer(<CvPdfDocument />);
    const pdfArray = new Uint8Array(pdfBuffer);

    const fileSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return new Response(pdfArray, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="william-callahan-cv-${fileSuffix}.pdf"`,
        "X-Correlation-ID": correlationId,
      },
    });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const isMissingFont = /font|typeface/i.test(normalizedError.message);
    const status = isMissingFont ? 424 : 500;
    const problem = buildProblemDetails({
      title: "CV PDF rendering failed",
      detail: normalizedError.message,
      status,
      instance,
      correlationId,
    });

    logger.error(
      `[CV PDF] Rendering failure (status: ${status}, correlationId: ${correlationId})`,
      normalizedError.stack ?? normalizedError.message,
    );

    return new Response(JSON.stringify(problem), {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/problem+json",
        "X-Correlation-ID": correlationId,
      },
    });
  }
}
