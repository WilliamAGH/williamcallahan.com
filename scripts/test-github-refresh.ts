#!/usr/bin/env bun

/**
 * Test script to diagnose GitHub activity refresh issues
 * 
 * Usage:
 *   bun run scripts/test-github-refresh.ts
 *   
 * This script tests both direct function calls and API endpoint calls
 * to help diagnose why GitHub activity isn't updating.
 */

import { config } from "dotenv";
config(); // Load .env file

import { refreshGitHubActivityDataFromApi } from "../lib/data-access/github.js";
import { getS3ObjectMetadata } from "../lib/s3-utils.js";

// ANSI color codes for better visibility
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

async function testDirectRefresh() {
  console.log(`\n${colors.blue}=== Testing Direct GitHub Refresh ===${colors.reset}`);
  
  try {
    // Check environment variables
    console.log(`\n${colors.cyan}Environment Check:${colors.reset}`);
    console.log(`  GITHUB_REPO_OWNER: ${process.env.GITHUB_REPO_OWNER || "❌ NOT SET"}`);
    console.log(`  GITHUB_ACCESS_TOKEN_COMMIT_GRAPH: ${process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH ? "✅ SET" : "❌ NOT SET"}`);
    console.log(`  GITHUB_API_TOKEN: ${process.env.GITHUB_API_TOKEN ? "✅ SET" : "❌ NOT SET"}`);
    console.log(`  GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? "✅ SET" : "❌ NOT SET"}`);
    console.log(`  S3_BUCKET: ${process.env.S3_BUCKET || "❌ NOT SET"}`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || "not set (defaults to production)"}`);
    
    // Check S3 data before refresh
    console.log(`\n${colors.cyan}S3 Data Check (Before Refresh):${colors.reset}`);
    const envSuffix = process.env.NODE_ENV === "production" || !process.env.NODE_ENV ? "" : process.env.NODE_ENV === "test" ? "-test" : "-dev";
    const activityKey = `github-activity/activity_data${envSuffix}.json`;
    
    const metadata = await getS3ObjectMetadata(activityKey);
    if (metadata) {
      console.log(`  Activity file exists: ${activityKey}`);
      console.log(`  Last modified: ${metadata.LastModified?.toISOString()}`);
      console.log(`  Age: ${metadata.LastModified ? Math.round((Date.now() - metadata.LastModified.getTime()) / (1000 * 60 * 60 * 24)) : "unknown"} days old`);
    } else {
      console.log(`  ${colors.yellow}⚠️  Activity file not found: ${activityKey}${colors.reset}`);
    }
    
    // Perform the refresh
    console.log(`\n${colors.cyan}Executing Direct Refresh:${colors.reset}`);
    const startTime = Date.now();
    const result = await refreshGitHubActivityDataFromApi();
    const duration = Date.now() - startTime;
    
    if (result) {
      console.log(`  ${colors.green}✅ Refresh successful!${colors.reset}`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Trailing year contributions: ${result.trailingYearData.totalContributions}`);
      console.log(`  All-time contributions: ${result.allTimeData.totalContributions}`);
      
      // Check S3 data after refresh
      console.log(`\n${colors.cyan}S3 Data Check (After Refresh):${colors.reset}`);
      const newMetadata = await getS3ObjectMetadata(activityKey);
      if (newMetadata) {
        console.log(`  Last modified: ${newMetadata.LastModified?.toISOString()}`);
        console.log(`  ${colors.green}✅ S3 file was updated${colors.reset}`);
      }
    } else {
      console.log(`  ${colors.red}❌ Refresh returned null${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`  ${colors.red}❌ Error during direct refresh:${colors.reset}`, error);
  }
}

async function testAPIRefresh() {
  console.log(`\n${colors.blue}=== Testing API Endpoint Refresh ===${colors.reset}`);
  
  const cronSecret = process.env.GITHUB_CRON_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;
  const refreshSecret = process.env.GITHUB_REFRESH_SECRET;
  
  console.log(`\n${colors.cyan}API Authentication Check:${colors.reset}`);
  console.log(`  GITHUB_CRON_REFRESH_SECRET: ${process.env.GITHUB_CRON_REFRESH_SECRET ? "✅ SET" : "❌ NOT SET"}`);
  console.log(`  BOOKMARK_CRON_REFRESH_SECRET: ${process.env.BOOKMARK_CRON_REFRESH_SECRET ? "✅ SET" : "❌ NOT SET"}`);
  console.log(`  GITHUB_REFRESH_SECRET: ${refreshSecret ? "✅ SET" : "❌ NOT SET"}`);
  
  // Test with cron authentication
  if (cronSecret) {
    console.log(`\n${colors.cyan}Testing with Bearer Token (Cron Auth):${colors.reset}`);
    try {
      const response = await fetch("http://localhost:3000/api/github-activity/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cronSecret}`,
        },
      });
      
      const data: unknown = await response.json();
      console.log(`  Status: ${response.status}`);
      console.log("  Response:", JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`  ${colors.red}❌ Error with cron auth:${colors.reset}`, error);
    }
  }
  
  // Test with refresh secret
  if (refreshSecret) {
    console.log(`\n${colors.cyan}Testing with x-refresh-secret:${colors.reset}`);
    try {
      const response = await fetch("http://localhost:3000/api/github-activity/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-refresh-secret": refreshSecret,
        },
      });
      
      const data: unknown = await response.json();
      console.log(`  Status: ${response.status}`);
      console.log("  Response:", JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`  ${colors.red}❌ Error with refresh secret:${colors.reset}`, error);
    }
  }
}

async function main() {
  console.log(`${colors.magenta}GitHub Activity Refresh Diagnostic Test${colors.reset}`);
  console.log(`${colors.magenta}======================================${colors.reset}`);
  
  // Test direct refresh (what the cron job uses)
  await testDirectRefresh();
  
  // Test API endpoint refresh
  if (process.env.PORT || process.env.NEXT_PUBLIC_URL) {
    await testAPIRefresh();
  } else {
    console.log(`\n${colors.yellow}⚠️  Skipping API tests (server not running locally)${colors.reset}`);
  }
  
  console.log(`\n${colors.magenta}Test complete!${colors.reset}\n`);
}

// Run the test
main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});