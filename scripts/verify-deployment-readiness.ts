#!/usr/bin/env bun

/**
 * Deployment Readiness Verification Script
 *
 * Run this before every deployment to catch potential production issues early.
 * This script validates configuration, tests critical paths, and ensures
 * environment-specific requirements are met.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { exec as _exec } from "node:child_process";
import type { DeploymentReadinessCheckResult } from "@/types/health";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const execAsync = promisify(_exec);

class DeploymentVerifier {
  private checks: DeploymentReadinessCheckResult[] = [];
  private targetEnv: string;

  constructor(targetEnv: string = "production") {
    this.targetEnv = targetEnv;
  }

  private log(message: string, color: string = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  private addCheck(result: DeploymentReadinessCheckResult) {
    this.checks.push(result);
    const icon = result.passed ? "✅" : result.severity === "critical" ? "❌" : "⚠️";
    const color = result.passed
      ? colors.green
      : result.severity === "critical"
        ? colors.red
        : colors.yellow;
    this.log(`${icon} ${result.name}`, color);
    if (!result.passed) {
      this.log(`   ${result.message}`, colors.reset);
      if (result.details) {
        result.details.forEach((detail) => this.log(`     - ${detail}`, colors.reset));
      }
    }
  }

  // 1. Environment Configuration Checks
  async checkEnvironmentConfig(): Promise<void> {
    this.log("\n🔍 Checking Environment Configuration...", colors.cyan);

    // Check required environment variables
    const requiredEnvVars = [
      "NODE_ENV",
      "NEXT_PUBLIC_SITE_URL",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_SERVER_URL",
      "NEXT_PUBLIC_S3_CDN_URL",
    ];

    const envFile = join(process.cwd(), `.env.${this.targetEnv}`);
    const envLocalFile = join(process.cwd(), `.env.${this.targetEnv}.local`);

    const envVars: Record<string, string> = {};

    // Load environment variables from files
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf-8");
      content.split("\n").forEach((line) => {
        const [key, value] = line.split("=");
        if (key && value) envVars[key.trim()] = value.trim();
      });
    }

    if (existsSync(envLocalFile)) {
      const content = readFileSync(envLocalFile, "utf-8");
      content.split("\n").forEach((line) => {
        const [key, value] = line.split("=");
        if (key && value) envVars[key.trim()] = value.trim();
      });
    }

    const missingVars = requiredEnvVars.filter((v) => !envVars[v] && !process.env[v]);

    this.addCheck({
      name: "Required Environment Variables",
      category: "Environment",
      passed: missingVars.length === 0,
      message: `Missing ${missingVars.length} required environment variables`,
      severity: "critical",
      details: missingVars,
    });

    // Check environment detection logic
    const siteUrl = envVars.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
    const expectedEnv = siteUrl.includes("dev.") ? "development" : "production";
    const expectedSuffix = expectedEnv === "production" ? "" : "-dev";

    this.addCheck({
      name: "Environment Detection",
      category: "Environment",
      passed: true,
      message: `Site URL (${siteUrl}) will resolve to ${expectedEnv} environment with suffix "${expectedSuffix}"`,
      severity: "info",
    });
  }

  // 2. Route Configuration Checks
  async checkRouteConfiguration(): Promise<void> {
    this.log("\n🔍 Checking Route Configuration...", colors.cyan);

    const routeFiles = [
      "src/app/bookmarks/page.tsx",
      "src/app/bookmarks/[slug]/page.tsx",
      "src/app/bookmarks/page/[pageNumber]/page.tsx",
      "src/app/bookmarks/tags/[...slug]/page.tsx",
    ];

    const dynamicRoutes: string[] = [];
    const staticRoutes: string[] = [];

    for (const file of routeFiles) {
      const filePath = join(process.cwd(), file);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");

        if (content.includes('export const dynamic = "force-dynamic"')) {
          dynamicRoutes.push(file);
        } else if (
          content.includes("generateStaticParams") &&
          !content.includes("//") &&
          !content.includes("/*")
        ) {
          staticRoutes.push(file);
        }
      }
    }

    this.addCheck({
      name: "Dynamic Route Configuration",
      category: "Routes",
      passed: staticRoutes.length === 0,
      message:
        staticRoutes.length > 0
          ? `Found ${staticRoutes.length} routes with static generation that may fail in production`
          : "All bookmark routes use dynamic rendering",
      severity: "critical",
      details: staticRoutes,
    });
  }

  // 3. S3 Connectivity Check
  async checkS3Connectivity(): Promise<void> {
    this.log("\n🔍 Checking S3 Connectivity...", colors.cyan);

    try {
      const response = await fetch("http://localhost:3001/api/bookmarks/diagnostics");
      if (response.ok) {
        const data = await response.json();

        this.addCheck({
          name: "S3 Configuration",
          category: "S3",
          passed: data.s3Config?.bucketSet && data.s3Config?.endpointSet,
          message:
            data.s3Config?.bucketSet && data.s3Config?.endpointSet
              ? "S3 properly configured"
              : "S3 configuration incomplete",
          severity: "critical",
          details: !data.s3Config?.bucketSet ? ["S3_BUCKET not set"] : [],
        });

        this.addCheck({
          name: "S3 Data Availability",
          category: "S3",
          passed: data.checks?.datasetOk && data.checks?.indexOk && data.checks?.slugMapOk,
          message: "S3 bookmark data health check",
          severity: "critical",
          details: [
            !data.checks?.datasetOk && "Bookmarks dataset missing",
            !data.checks?.indexOk && "Bookmarks index missing",
            !data.checks?.slugMapOk && "Slug mapping missing",
          ].filter(Boolean) as string[],
        });
      }
    } catch {
      this.addCheck({
        name: "S3 Diagnostics API",
        category: "S3",
        passed: false,
        message: "Could not reach diagnostics endpoint (is dev server running on port 3001?)",
        severity: "warning",
      });
    }
  }

  // 4. Build Validation
  async checkBuildIntegrity(): Promise<void> {
    this.log("\n🔍 Checking Build Integrity...", colors.cyan);

    // Check if .next directory exists
    const nextDir = join(process.cwd(), ".next");
    const buildExists = existsSync(nextDir);

    this.addCheck({
      name: "Build Output",
      category: "Build",
      passed: buildExists,
      message: buildExists ? "Build output exists" : "No build output found - run 'bun run build'",
      severity: "critical",
    });

    // Check for TypeScript errors
    try {
      await execAsync("bun run type-check");
      this.addCheck({
        name: "TypeScript Validation",
        category: "Build",
        passed: true,
        message: "No TypeScript errors",
        severity: "critical",
      });
    } catch (error: unknown) {
      this.addCheck({
        name: "TypeScript Validation",
        category: "Build",
        passed: false,
        message: "TypeScript errors detected",
        severity: "critical",
        details: (error as { stdout?: string }).stdout?.split("\n").slice(0, 5),
      });
    }
  }

  // 5. Critical Routes Test
  async checkCriticalRoutes(): Promise<void> {
    this.log("\n🔍 Testing Critical Routes...", colors.cyan);

    const criticalRoutes = [
      { path: "/", name: "Homepage" },
      { path: "/bookmarks", name: "Bookmarks List" },
      { path: "/blog", name: "Blog" },
      { path: "/projects", name: "Projects" },
      { path: "/api/health", name: "Health Check API" },
      { path: "/api/bookmarks/diagnostics", name: "Bookmarks Diagnostics API" },
    ];

    for (const route of criticalRoutes) {
      try {
        const response = await fetch(`http://localhost:3001${route.path}`);
        this.addCheck({
          name: `Route: ${route.name}`,
          category: "Routes",
          passed: response.ok,
          message: `${route.path} returned ${response.status}`,
          severity: response.status === 404 ? "critical" : "warning",
        });
      } catch {
        this.addCheck({
          name: `Route: ${route.name}`,
          category: "Routes",
          passed: false,
          message: `Could not test ${route.path} (is dev server running?)`,
          severity: "warning",
        });
      }
    }
  }

  // 6. Memory and Performance Checks
  async checkPerformance(): Promise<void> {
    this.log("\n🔍 Checking Performance Configuration...", colors.cyan);

    // Check package.json for memory settings
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    const buildScript = packageJson.scripts?.build || "";

    const hasMemoryConfig = buildScript.includes("--max-old-space-size");

    this.addCheck({
      name: "Build Memory Configuration",
      category: "Performance",
      passed: hasMemoryConfig,
      message: hasMemoryConfig
        ? "Build has memory optimization"
        : "Consider adding --max-old-space-size to build script",
      severity: "warning",
    });

    // Check for large files that might cause issues
    const publicDir = join(process.cwd(), "public");
    if (existsSync(publicDir)) {
      try {
        const { stdout } = await execAsync(`find ${publicDir} -type f -size +5M`);
        const largeFiles = stdout.split("\n").filter(Boolean);

        this.addCheck({
          name: "Large Static Files",
          category: "Performance",
          passed: largeFiles.length === 0,
          message:
            largeFiles.length > 0
              ? `Found ${largeFiles.length} files over 5MB in public directory`
              : "No large static files detected",
          severity: "warning",
          details: largeFiles.map((f) => f.replace(publicDir, "public")),
        });
      } catch {
        // ignore, find can fail if no files are found
      }
    }
  }

  // Generate summary report
  generateReport(): void {
    this.log("\n" + "=".repeat(60), colors.cyan);
    this.log("📊 DEPLOYMENT READINESS REPORT", colors.cyan);
    this.log("=".repeat(60), colors.cyan);

    const criticalIssues = this.checks.filter((c) => !c.passed && c.severity === "critical");
    const warnings = this.checks.filter((c) => !c.passed && c.severity === "warning");
    const passed = this.checks.filter((c) => c.passed);

    this.log(`\nTarget Environment: ${this.targetEnv.toUpperCase()}`, colors.magenta);
    this.log(`Total Checks: ${this.checks.length}`);
    this.log(`✅ Passed: ${passed.length}`, colors.green);
    this.log(`⚠️  Warnings: ${warnings.length}`, colors.yellow);
    this.log(`❌ Critical Issues: ${criticalIssues.length}`, colors.red);

    if (criticalIssues.length > 0) {
      this.log("\n🚨 CRITICAL ISSUES MUST BE RESOLVED:", colors.red);
      criticalIssues.forEach((issue) => {
        this.log(`  - ${issue.name}: ${issue.message}`, colors.red);
      });
    }

    if (warnings.length > 0) {
      this.log("\n⚠️  WARNINGS TO REVIEW:", colors.yellow);
      warnings.forEach((warning) => {
        this.log(`  - ${warning.name}: ${warning.message}`, colors.yellow);
      });
    }

    const readyToDeploy = criticalIssues.length === 0;
    this.log("\n" + "=".repeat(60), colors.cyan);
    if (readyToDeploy) {
      this.log("✅ READY FOR DEPLOYMENT", colors.green);
    } else {
      this.log("❌ NOT READY FOR DEPLOYMENT", colors.red);
      this.log("Please resolve critical issues before deploying.", colors.red);
    }
    this.log("=".repeat(60) + "\n", colors.cyan);

    process.exit(readyToDeploy ? 0 : 1);
  }

  async run(): Promise<void> {
    this.log("🚀 Starting Deployment Readiness Verification...", colors.cyan);
    this.log(`Target Environment: ${this.targetEnv}`, colors.magenta);

    await this.checkEnvironmentConfig();
    await this.checkRouteConfiguration();
    await this.checkS3Connectivity();
    await this.checkBuildIntegrity();
    await this.checkCriticalRoutes();
    await this.checkPerformance();

    this.generateReport();
  }
}

// Parse command line arguments
const targetEnv = process.argv[2] || "production";

// Run verification
const verifier = new DeploymentVerifier(targetEnv);
verifier.run().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
