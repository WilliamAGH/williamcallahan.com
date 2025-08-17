# Bookmark Slug Deployment Guide

## Overview

Bookmark slug pages (`/bookmarks/[slug]`) require slug mapping data to be present in S3. This data is NOT generated during the Next.js build process but must be populated separately.

## How It Works

1. **Next.js Controls NODE_ENV**
   - `NODE_ENV=production` in production builds
   - `NODE_ENV=development` in dev mode
   - This determines the S3 path suffix for data files

2. **S3 Path Structure**
   - Production: `json/bookmarks/slug-mapping.json`
   - Development: `json/bookmarks/slug-mapping-dev.json`
   - Test: `json/bookmarks/slug-mapping-test.json`

3. **Fallback Mechanism**
   - The slug manager now tries the primary path first
   - Falls back to other environment paths if not found
   - This ensures pages work even if data is in the "wrong" path

## Deployment Process

### Option 1: Run Data Updater (Recommended)

Run the data updater after deployment to populate all S3 data:

```bash
# On the deployed server
bun scripts/data-updater.ts --bookmarks --force
```

This will:
- Fetch fresh bookmarks from the API
- Generate slug mappings
- Save all data to S3 with correct environment suffix

### Option 2: Ensure Slug Mappings Only

If bookmarks already exist but slug mappings are missing:

```bash
# Quick fix - just ensure slug mappings exist
bun scripts/ensure-slug-mappings.ts

# Force regenerate even if they exist
bun scripts/ensure-slug-mappings.ts --force

# Save to all environment paths for redundancy
bun scripts/ensure-slug-mappings.ts --all-paths
```

### Option 3: GitHub Actions / CI Pipeline

Add to your deployment workflow:

```yaml
- name: Populate S3 Data
  run: |
    bun install
    bun scripts/data-updater.ts --bookmarks --logos --search-indexes
```

### Option 4: Scheduled Updates

Set up a cron job to keep data fresh:

```bash
# Run every 6 hours
0 */6 * * * cd /path/to/app && bun scripts/data-updater.ts --bookmarks
```

## Troubleshooting

### 404 Errors on Bookmark Pages

1. **Check if slug mapping exists:**
   ```bash
   bun scripts/debug-slug-mapping.ts
   ```

2. **Verify NODE_ENV matches expectation:**
   ```bash
   echo $NODE_ENV
   # Should match what Next.js uses
   ```

3. **Force regenerate with redundancy:**
   ```bash
   bun scripts/ensure-slug-mappings.ts --force --all-paths
   ```

### Environment Mismatch

If NODE_ENV during data population doesn't match runtime:

1. The fallback mechanism will try all paths
2. You'll see warnings in logs about using fallback paths
3. Run `ensure-slug-mappings.ts` to fix

### Missing S3 Credentials

Ensure these environment variables are set:
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT` (if not using AWS)
- `S3_REGION`

## Best Practices

1. **Always run data-updater after deployment**
   - This ensures all S3 data is fresh and in sync

2. **Use scheduled updates**
   - Keeps bookmarks and slug mappings current
   - Prevents stale data issues

3. **Monitor logs**
   - Check for fallback path warnings
   - Indicates environment configuration issues

4. **Test after deployment**
   - Visit a bookmark slug page
   - Check browser console for errors
   - Review server logs

## Architecture Notes

- **Build-time**: Next.js builds pages, but NOT S3 data
- **Deploy-time**: Run data-updater to populate S3
- **Runtime**: Pages fetch data from S3 with fallbacks
- **Scheduled**: Keep data fresh with periodic updates

## Environment Variables

The system respects Next.js NODE_ENV handling:
- Don't manually set NODE_ENV in production
- Let Next.js manage it automatically
- The code adapts to whatever NODE_ENV is set

## Scripts Reference

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `data-updater.ts` | Full data refresh | After deployment, scheduled |
| `ensure-slug-mappings.ts` | Just slug mappings | Quick fix for 404s |
| `debug-slug-mapping.ts` | Diagnose issues | When troubleshooting |
| `fix-slug-404.ts` | Comprehensive fix | Emergency recovery |

## Summary

The key insight is that **S3 data population is separate from the Next.js build**. Always run `data-updater.ts` or `ensure-slug-mappings.ts` after deploying to ensure bookmark slug pages work correctly.