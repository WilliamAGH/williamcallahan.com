import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import CvPdfDocument from "@/components/features/cv/CvPdfDocument";

export async function GET(): Promise<Response> {
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
      },
    });
  } catch (error) {
    // Enhanced error logging for debugging
    console.error("CV PDF Generation Error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
    });

    const message = error instanceof Error ? error.message : "Unable to generate the requested CV PDF.";

    return new Response(
      JSON.stringify({
        error: message,
        details: process.env.NODE_ENV === "development" ? error?.toString() : undefined,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
