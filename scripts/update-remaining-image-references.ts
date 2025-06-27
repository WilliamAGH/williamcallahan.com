#!/usr/bin/env bun

/**
 * Update remaining image references to use S3 URLs
 * 
 * This script updates all remaining hard-coded image paths to use the static image mapping
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Define the updates to make
const FILE_UPDATES = [
  {
    file: "components/features/investments/investment-card.client.tsx",
    replacements: [
      {
        old: 'src="/images/aVenture Favicon.png"',
        new: 'src={getStaticImageUrl("/images/aVenture Favicon.png")}',
      },
    ],
    imports: ['import { getStaticImageUrl } from "@/lib/data-access/static-images";'],
  },
  {
    file: "data/experience.ts",
    replacements: [
      {
        old: 'logo: "/images/aVenture Favicon.png"',
        new: 'logo: getStaticImageUrl("/images/aVenture Favicon.png")',
      },
      {
        old: 'logo: "/images/techstars_logo.png"',
        new: 'logo: getStaticImageUrl("/images/techstars_logo.png")',
      },
      {
        old: 'logo: "/images/callahan_planning_logo.png"',
        new: 'logo: getStaticImageUrl("/images/callahan_planning_logo.png")',
      },
    ],
    imports: ['import { getStaticImageUrl } from "@/lib/data-access/static-images";'],
  },
  {
    file: "components/ui/accelerator-badge.tsx",
    replacements: [
      {
        old: 'src={`/images/$' + '{program}-logo.svg`}',
        new: 'src={getStaticImageUrl(`/images/$' + '{program}-logo.svg`)}',
      },
    ],
    imports: ['import { getStaticImageUrl } from "@/lib/data-access/static-images";'],
  },
  // Note: app/api/validate-logo/route.ts keeps reference-globe-icon.png in repo for performance
];

async function updateImageReferences() {
  console.log("🔄 Updating remaining image references to use S3 URLs...\n");

  for (const update of FILE_UPDATES) {
    const filePath = join(process.cwd(), update.file);
    
    try {
      let content = readFileSync(filePath, "utf-8");
      const originalContent = content;
      
      // Add imports if needed
      if (update.imports.length > 0) {
        for (const importStatement of update.imports) {
          if (!content.includes(importStatement)) {
            // Add import after the first import statement or at the beginning
            const firstImportIndex = content.indexOf("import ");
            if (firstImportIndex !== -1) {
              const lineEnd = content.indexOf("\n", firstImportIndex);
              content = content.slice(0, lineEnd + 1) + importStatement + "\n" + content.slice(lineEnd + 1);
            } else {
              content = importStatement + "\n\n" + content;
            }
          }
        }
      }
      
      // Make replacements
      for (const replacement of update.replacements) {
        content = content.replace(replacement.old, replacement.new);
      }
      
      if (content !== originalContent) {
        writeFileSync(filePath, content);
        console.log(`✅ Updated: ${update.file}`);
        for (const replacement of update.replacements) {
          console.log(`   - ${replacement.old} → ${replacement.new}`);
        }
      } else {
        console.log(`⏭️  No changes needed: ${update.file}`);
      }
      
    } catch (error) {
      console.error(`❌ Error updating ${update.file}:`, error);
    }
  }
  
  console.log("\n📝 Note: Remember to run the migration script first:");
  console.log("   bun run scripts/migrate-static-images-to-s3.ts");
  console.log("\n📝 For the validate-logo route, we'll need to update it to fetch from S3");
  console.log("   once the reference image is migrated.");
}

// Run the updates
updateImageReferences().catch((error) => {
  console.error("❌ Update failed:", error);
  process.exit(1);
});