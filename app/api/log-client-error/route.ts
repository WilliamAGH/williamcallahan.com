import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * API route to receive and log client-side errors
 * Stores logs in a server-side file for later analysis and outputs to stdout/stderr
 * for Docker container logs
 */
export async function POST(request: Request) {
  try {
    const errorData = await request.json();

    // Add server timestamp and request details
    const enrichedErrorData = {
      ...errorData,
      server_timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
    };

    try {
      // Create logs directory if it doesn't exist
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Write to a log file - rotate daily for easier management
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(logDir, `client-errors-${today}.log`);

      // Format log entry
      const logEntry = `[${new Date().toISOString()}] ${JSON.stringify(enrichedErrorData)}\n`;

      // Append to log file
      await fs.promises.appendFile(logFile, logEntry);
    } catch (fsError) {
      // If file logging fails, don't prevent console logging
      console.error('File logging error:', fsError);
    }

    // Format a detailed, highly visible log entry for Docker container logs
    // IMPORTANT: This will show up in Docker container logs
    const resource = errorData.resource || 'unknown';
    const errorType = errorData.type || 'unknown';
    const url = errorData.url || 'unknown';
    const message = errorData.message || 'No message provided';

    // Create a prominent, easy-to-spot log entry
    console.error('\n==================================================================');
    console.error(`[CHUNK_ERROR_DETECTED] ${new Date().toISOString()}`);
    console.error('------------------------------------------------------------------');
    console.error(`TYPE: ${errorType}`);
    console.error(`RESOURCE: ${resource}`);
    console.error(`URL: ${url}`);
    console.error(`MESSAGE: ${message}`);
    console.error(`BUILD_ID: ${errorData.buildId || 'unknown'}`);
    console.error('------------------------------------------------------------------');
    console.error('FULL DATA:', JSON.stringify(enrichedErrorData, null, 2));
    console.error('==================================================================\n');

    return NextResponse.json({ success: true });
  } catch (error) {
    // Log server-side errors but don't expose details to client
    console.error('\n==================================================================');
    console.error('[ERROR_LOGGING_FAILURE] Failed to process client error report');
    console.error('------------------------------------------------------------------');
    console.error(error);
    console.error('==================================================================\n');

    return NextResponse.json(
      { success: false, message: 'Error processing log' },
      { status: 500 }
    );
  }
}