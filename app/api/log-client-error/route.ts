import fs from "node:fs";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
// import type { ClientErrorPayload } from '@/types'; // Assuming @/types maps to ./types/index.ts or similar
import { z } from "zod";

/**
 * API route to receive and log client-side errors
 * Stores logs in a server-side file for later analysis and outputs to stdout/stderr
 * for Docker container logs
 */

// Define the Zod schema for client error payloads
const ClientErrorSchema = z
  .object({
    message: z.string().optional(),
    resource: z.string().optional(), // e.g., script URL if it's a script error
    type: z.string().optional(), // e.g., 'ChunkLoadError', 'TypeError'
    url: z.string().optional(), // The URL where the error occurred
    stack: z.string().optional(),
    buildId: z.string().optional(), // Next.js build ID
  })
  .passthrough(); // Allows other properties, matching [key: string]: unknown;

export async function POST(request: NextRequest) {
  try {
    // Cast the parsed JSON to our defined type
    const errorData = ClientErrorSchema.parse(await request.json());

    // Add server timestamp and request details
    const enrichedErrorData: z.infer<typeof ClientErrorSchema> & {
      server_timestamp: string;
      ip: string;
      user_agent: string;
    } = {
      ...errorData,
      server_timestamp: new Date().toISOString(),
      ip: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
    };

    try {
      // Create logs directory if it doesn't exist
      const logDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Write to a log file - rotate daily for easier management
      const today = new Date().toISOString().split("T")[0];
      const logFile = path.join(logDir, `client-errors-${today}.log`);

      // Format log entry
      const logEntry = `[${new Date().toISOString()}] ${JSON.stringify(enrichedErrorData)}\n`;

      // Append to log file
      await fs.promises.appendFile(logFile, logEntry);
    } catch (fsError) {
      // If file logging fails, don't prevent console logging
      console.error("File logging error:", fsError);
    }

    // Format a detailed, highly visible log entry for Docker container logs
    // IMPORTANT: This will show up in Docker container logs
    // Use type checks for safer access to potentially undefined properties
    const resource = typeof errorData.resource === "string" ? errorData.resource : "unknown";
    const errorType = typeof errorData.type === "string" ? errorData.type : "unknown";
    const url = typeof errorData.url === "string" ? errorData.url : "unknown";
    const message = typeof errorData.message === "string" ? errorData.message : "No message provided";
    const buildId = typeof errorData.buildId === "string" ? errorData.buildId : "unknown";

    // Create a prominent, easy-to-spot log entry
    console.error("\n==================================================================");
    console.error(`[CHUNK_ERROR_DETECTED] ${new Date().toISOString()}`);
    console.error("------------------------------------------------------------------");
    console.error(`TYPE: ${errorType}`);
    console.error(`RESOURCE: ${resource}`);
    console.error(`URL: ${url}`);
    console.error(`MESSAGE: ${message}`);
    console.error(`BUILD_ID: ${buildId}`);
    console.error("------------------------------------------------------------------");
    console.error("FULL DATA:", JSON.stringify(enrichedErrorData, null, 2));
    console.error("==================================================================\n");

    return NextResponse.json({ success: true });
  } catch (error) {
    // Log server-side errors but don't expose details to client
    console.error("\n==================================================================");
    console.error("[ERROR_LOGGING_FAILURE] Failed to process client error report");
    console.error("------------------------------------------------------------------");
    console.error(error);
    console.error("==================================================================\n");

    return NextResponse.json({ success: false, message: "Error processing log" }, { status: 500 });
  }
}
