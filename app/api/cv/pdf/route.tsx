import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import CvPdfDocument from "@/components/features/cv/CvPdfDocument";
import logger from "@/lib/utils/logger";

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

export async function GET(request: Request): Promise<Response> {
  const correlationId = globalThis.crypto.randomUUID();
  const instance = new URL(request.url).pathname;

  try {
    const pdfBuffer = await renderToBuffer(<CvPdfDocument />);
    const pdfArray = new Uint8Array(pdfBuffer);

    const fileSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return new Response(pdfArray, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="william-callahan-cv-${fileSuffix}.pdf"`,
        "Cache-Control": "no-store",
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
        "Content-Type": "application/problem+json",
        "Cache-Control": "no-store",
        "X-Correlation-ID": correlationId,
      },
    });
  }
}
