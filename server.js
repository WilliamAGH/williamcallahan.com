/**
 * Custom Next.js Server
 *
 * Enhances the standard Next.js server with:
 * - Sharp warm-up for faster initial image processing
 * - Increased HTTP agent connection limits
 * - Basic error handling and logging
 */

// Force IPv4 (set before any imports)
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS || '';
process.env.NODE_OPTIONS += ' --dns-result-order=ipv4first';

// Import required modules
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const sharp = require('sharp');
const http = require('http');
const https = require('https');

// Configure HTTP/HTTPS agents for better connection handling
http.globalAgent.maxSockets = 100;
https.globalAgent.maxSockets = 100;

// Get port from environment or use default
const port = parseInt(process.env.PORT || '3000', 10);

// Determine environment
const dev = process.env.NODE_ENV !== 'production';

// Initialize Next.js app
const app = next({ dev });
const handle = app.getRequestHandler();

// Warm up Sharp module to avoid cold start penalty
console.log('Warming up Sharp image processing...');
sharp(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
  .resize(10, 10)
  .toBuffer()
  .then(() => console.log('Sharp warm-up complete'))
  .catch(err => console.error('Sharp warm-up failed:', err));

// Prepare the server
app.prepare().then(() => {
  // Create HTTP server
  createServer((req, res) => {
    // Parse URL
    const parsedUrl = parse(req.url, true);

    // Let Next.js handle the request
    handle(req, res, parsedUrl);
  }).listen(port, (err) => {
    if (err) throw err;

    const host = process.env.HOSTNAME || 'localhost';
    console.log(`> Ready on http://${host}:${port}`);

    // Notify that we're fully ready to handle requests
    console.log('Server initialization complete, ready to handle requests');
  });
}).catch(err => {
  console.error('Error starting server:', err);
  process.exit(1);
});