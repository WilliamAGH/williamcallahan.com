#!/usr/bin/env node

/**
 * Configuration Consolidation Script
 *
 * This script helps consolidate the ridiculous number of config files
 * in modern JavaScript projects into a more manageable structure.
 */

import fs from "node:fs/promises";

const ROOT_DIR = process.cwd();

// Files already consolidated to config/ (via --config flags in package.json scripts)
const ALREADY_IN_CONFIG = [
  ".browserslistrc",
  ".hintrc",
  ".remarkrc.mjs",
  "stylelint.config.js",
  "happydom.ts",
  "eslint.config.ts",
  "vitest.config.ts",
  "biome.json",
  "sgconfig.yml",
  "oxlintrc.json",
  "oxfmtrc.json",
  "drizzle.config.ts",
  "tailwind.config.js",
];

// Files that MUST stay in root (required by tools)
const ROOT_REQUIRED = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.js", // Next.js auto-discovers from root
  ".gitignore",
  ".env*",
];

// Files that can be consolidated into package.json
const PACKAGE_JSON_CONSOLIDATABLE = {
  ".browserslistrc": "browserslist",
  "bunfig.toml": "bun", // Some bun config can go in package.json
};

async function analyzeConfigs() {
  console.log("🔍 Analyzing configuration files...\n");

  let files;
  try {
    files = await fs.readdir(ROOT_DIR);
  } catch (error) {
    console.error("❌ Failed to read directory:", error.message);
    process.exit(1);
  }

  const configFiles = files.filter((file) => {
    // More specific patterns for actual config files
    return (
      /^\.(?!git|next|env)/.test(file) || // dot files excluding common non-config ones
      /config\.(js|ts|json|mjs)$/.test(file) ||
      /\.(config|rc)\.(js|ts|json|mjs|toml)$/.test(file) ||
      ["package.json", "tsconfig.json", "next.config.ts", "tailwind.config.js"].includes(file)
    );
  });

  console.log("📊 Configuration Files Found:");
  for (const file of configFiles) {
    console.log(`  - ${file}`);
  }
  console.log(`\n📈 Total: ${configFiles.length} config files`);

  return configFiles;
}

async function createConsolidationPlan() {
  const configs = await analyzeConfigs();

  console.log("\n📋 CONSOLIDATION PLAN:\n");

  console.log("🟢 ALREADY IN config/:");
  for (const file of ALREADY_IN_CONFIG) {
    console.log(`  ✅ config/${file}`);
  }

  console.log("\n🔴 MUST STAY IN ROOT:");
  for (const pattern of ROOT_REQUIRED) {
    const matching = configs.filter((file) =>
      pattern.includes("*") ? file.startsWith(pattern.replace("*", "")) : file === pattern,
    );
    for (const file of matching) {
      console.log(`  📌 ${file}`);
    }
  }

  console.log("\n🟡 CAN CONSOLIDATE INTO package.json:");
  for (const [file, field] of Object.entries(PACKAGE_JSON_CONSOLIDATABLE)) {
    if (configs.includes(file)) {
      console.log(`  🔄 ${file} → package.json.${field}`);
    }
  }
}

function executeConsolidation() {
  console.log(
    "\n🚀 Would you like to execute this consolidation? (This script just shows the plan)\n",
  );
  console.log("Next steps:");
  console.log("1. Review the plan above");
  console.log("2. Manually move safe files to config/");
  console.log("3. Update tool configs to reference new paths");
  console.log("4. Test that everything still works");
  console.log("5. Consider switching to more modern alternatives like:");
  console.log("   - Biome (replaces ESLint + Prettier)");
  console.log("   - Vite (simpler than complex webpack configs)");
  console.log("   - pnpm/bun (less config than npm/yarn)");
}

// Run the analysis
createConsolidationPlan().then(executeConsolidation).catch(console.error);
