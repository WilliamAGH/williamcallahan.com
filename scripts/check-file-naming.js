#!/usr/bin/env node

/**
 * File Naming Convention Checker
 *
 * This script checks for React components that don't follow the proper naming
 * convention for client/server components.
 *
 * Pattern:
 * - *.client.tsx - Must contain 'use client' directive
 * - *.server.tsx - Must NOT contain 'use client' directive
 * - Regular components without .client/.server should be reviewed manually
 * - All files should use kebab-case (dash-separated-words) naming
 *
 * Usage: node scripts/check-file-naming.js
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);

// Directories to scan
const DIRS_TO_SCAN = [
  'components',
  'app'
];

// File patterns to match
const FILE_PATTERNS = {
  CLIENT: /\.client\.(tsx|ts)$/,
  SERVER: /\.server\.(tsx|ts)$/,
  COMPONENT: /\.(tsx|ts)$/,
  KEBAB_CASE: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.(client|server))?\.(tsx|ts)$/
};

async function checkFile(filePath) {
  try {
    const content = await readFileAsync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const isClientFile = FILE_PATTERNS.CLIENT.test(fileName);
    const isServerFile = FILE_PATTERNS.SERVER.test(fileName);
    const isKebabCase = FILE_PATTERNS.KEBAB_CASE.test(fileName);
    const hasUseClient = content.includes('"use client"') || content.includes("'use client'");

    // Check for kebab-case naming
    if (!isKebabCase) {
      return {
        file: filePath,
        issue: `File name should use kebab-case (dash-separated-words)`,
        type: 'error'
      };
    }

    // Check for violations
    if (isClientFile && !hasUseClient) {
      return {
        file: filePath,
        issue: `Client component missing "use client" directive`,
        type: 'error'
      };
    }

    if (isServerFile && hasUseClient) {
      return {
        file: filePath,
        issue: `Server component has "use client" directive (should be removed)`,
        type: 'error'
      };
    }

    // For regular components, check if they have browser APIs
    if (!isClientFile && !isServerFile && hasUseClient) {
      return {
        file: filePath,
        issue: `Component has "use client" directive but no .client suffix`,
        type: 'warning'
      };
    }

    // Check for browser API usage in server components
    if (isServerFile && (content.includes('window.') || content.includes('document.'))) {
      return {
        file: filePath,
        issue: `Server component uses browser APIs (window/document)`,
        type: 'error'
      };
    }

    return null;
  } catch (err) {
    return {
      file: filePath,
      issue: `Error reading file: ${err.message}`,
      type: 'error'
    };
  }
}

async function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and .next
      if (file === 'node_modules' || file === '.next') continue;
      await walkDir(filePath, fileList);
    } else if (FILE_PATTERNS.COMPONENT.test(file)) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

async function main() {
  console.log('\nChecking file naming conventions...\n');

  const files = [];
  for (const dir of DIRS_TO_SCAN) {
    try {
      if (fs.existsSync(dir)) {
        const dirFiles = await walkDir(dir);
        files.push(...dirFiles);
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }

  console.log(`Found ${files.length} component files to check.\n`);

  const issues = [];
  let progress = 0;

  for (const file of files) {
    progress++;
    if (progress % 50 === 0) {
      process.stdout.write('.');
    }

    const issue = await checkFile(file);
    if (issue) {
      issues.push(issue);
    }
  }

  console.log('\n');

  if (issues.length === 0) {
    console.log('✓ All files follow the naming conventions!');
    return;
  }

  console.log(`Found ${issues.length} issues:\n`);

  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');

  if (errors.length > 0) {
    console.log(`ERRORS (${errors.length}):`);
    errors.forEach(({ file, issue }) => {
      console.log(`  ✗ ${file}`);
      console.log(`    ${issue}`);
    });
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    warnings.forEach(({ file, issue }) => {
      console.log(`  ! ${file}`);
      console.log(`    ${issue}`);
    });
    console.log();
  }

  // Return an error code for CI
  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});