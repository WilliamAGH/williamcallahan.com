# William Callahan's Personal Website
>
> ⚠️ Run tests with `bun run test` (Jest) instead of `bun test`.
This is the repo for my personal website [williamcallahan.com](https://williamcallahan.com). The code is hosted at [github.com/WilliamAGH/williamcallahan.com](https://github.com/WilliamAGH/williamcallahan.com). Below is some info on how the logo fetching works and other stuff to help me remember.

> "I don't know what I think until I read what I'm writing" - Shirley MacLaine

> "I write to find out what I think" - Joan Didion

## Hydration Safety Pattern

To avoid React hydration mismatches in client components that use formatting or locale-specific operations:

```tsx
// 1. Track mounted state
const [mounted, setMounted] = useState(false);

// 2. Set mounted flag after hydration is complete
useEffect(() => { setMounted(true) }, []);

// 3. Render placeholder during SSR and initial client render
if (!mounted) {
  return <div className="placeholder-styles" suppressHydrationWarning />;
}

// 4. Only render actual content on client after hydration
return <ActualContent />;
```

This pattern is essential for components that format text differently on server vs client (like dates, titles with case formatting, or dynamic content).

## Logo Storage and Caching

The site fetches company logos on demand. To avoid hitting APIs constantly and speed things up, it uses a couple of caching layers:

1. **Memory Cache:** Super fast, but clears whenever the app restarts. Good for logos you just looked up.
2. **Filesystem Cache (Optional):** If you set up a Docker volume, logos get saved to disk (`/app/data/images/logos` inside the container). This way, they stick around even if the container restarts. If there's no volume, it just uses the container's temporary filesystem (which also clears on restart). Logos are saved like `{md5(domain)}-{source}.png`.
3. **External Fetching:** If a logo isn't in memory or on disk, the app tries fetching it from Google, Clearbit, or DuckDuckGo. It does a quick check to make sure it's not a generic placeholder and converts everything to PNG.

**Bottom line:** The logo system works whether you set up persistent storage or not. Without it, it just relies on memory caching and re-fetches more often.

### Using a Docker Volume for Persistent Logos

If you want logos to persist across restarts, use a named Docker volume:

- **Volume Name:** `logo_storage`
- **Mount Point in Container:** `/app/data/images/logos`

Example `docker run` command:

```bash
# Create the volume first if it doesn't exist
docker volume create logo_storage

# Run the container, mounting the volume
docker run -v logo_storage:/app/data/images/logos ... your-other-options ... williamcallahan-website
```

You might need to fix permissions on the volume the first time:

```bash
# Make sure the container user (1001:1001) can write to the volume
docker run --rm -v logo_storage:/data alpine chown -R 1001:1001 /data
```

## Running the Site

### Simple Docker Run (No Persistent Logos)

Good for quick tests or if you don't care about keeping logos between restarts.

```bash
# Build the image
docker build -t williamcallahan-website .

# Run it (logos stored temporarily inside the container)
docker run -d \
  -p 3000:3000 \
  --name williamcallahan-website \
  williamcallahan-website
```

### Docker Run with Persistent Logos

Use this if you want logos saved to the `logo_storage` volume.

```bash
# Make sure the volume exists
docker volume create logo_storage

# Build if you haven't already
docker build -t williamcallahan-website .

# Run with the volume mounted
docker run -d \
  -p 3000:3000 \
  -v logo_storage:/app/data/images/logos \
  --name williamcallahan-website \
  williamcallahan-website
```

## Terminal Component

The site includes an interactive terminal component with the following features:

- **Command History:** Persisted in SessionStorage, remembers commands within a browser session
- **Window Controls:** Standard macOS-style controls (close, minimize, maximize) that function like a macOS app on the site
- **Maximize Mode:** Full-screen view with backdrop, dismissable by clicking outside or pressing `Escape`
- **Navigation:** Use commands like `home`, `blog`, `experience`, etc., to navigate the site
- **Section Search:** Search within specific sections like `blog`, `experience`, `investments` using commands like `blog <query>`
- **Selection View:** Displays search results or other options for interactive selection
- **Responsive:** Works across different screen sizes
- **Basic Commands:** `help`, `clear`
- **Easter Egg:** `schema.org` command displays structured data for the current page (more to come!)

It uses React Context for managing history and global state for window position (normal, minimized, maximized).

## Crashes

The app tries to be less fragile about failures:

- Checks if the filesystem directory (`/app/data/images/logos`) is usable on startup. Warns if not, but continues in memory-only mode.
- If fetching fails, it might retry. If it keeps failing for a specific domain, it'll cache the error for a bit to avoid hammering APIs.
- Falls back to a placeholder if it can't get a real logo.

### Clear Caches

```bash
# Clear just the in-memory cache (quick refresh)
curl -X POST http://localhost:3000/api/cache/clear

# Nuke the persistent disk cache (requires recreating volume & restarting)
# 1. Stop the container/service
docker stop williamcallahan-website # Or docker-compose down
# 2. Remove the volume
docker volume rm logo_storage
# 3. Recreate the volume
docker volume create logo_storage
# 4. Restart the container/service
docker start williamcallahan-website # Or docker-compose up -d
# (Optional: Re-run chown command if needed)
```

### Backup / Restore Logos (if using persistent volume)

```bash
# Backup logos to a tarball in your current directory
docker run --rm \
  -v logo_storage:/data:ro \
  -v "$(pwd):/backup" \
  alpine tar czf /backup/logos-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restore logos from a backup tarball
# Assumes the volume 'logo_storage' exists but might be empty
docker run --rm \
  -v logo_storage:/data \
  -v "$(pwd):/backup" \
  alpine sh -c "tar xzf /backup/logos-backup-YYYYMMDD.tar.gz -C /data && chown -R 1001:1001 /data"
```

### Check Health & Logs

```bash
# Check the health endpoint
curl http://localhost:3000/api/health

## Recalculating Persisted Data (e.g., GitHub Activity)

If significant changes are made to the underlying data fetching or processing logic (e.g., in `lib/data-access.ts` for how GitHub contributions are calculated), the persisted JSON files in the `data/` directory (like `data/github-activity/activity_data.json`, `data/github-activity/repo_raw_weekly_stats/`, `data/github-activity/aggregated_weekly_activity.json`, etc.) might become stale or reflect incorrect calculations.

To force a refresh of all persisted GitHub activity data, ensuring accuracy and bypassing any local development skip intervals:

1.  **Run the Data Updater Script with the `--github` flag:**
    This command will fetch and update GitHub activity data in S3.

    ```bash
    # Update GitHub data
    bun run update-s3 -- --github

    # Or update all data types
    bun run update-s3 -- --bookmarks --github --logos
    ```

This process ensures that the GitHub activity data is updated in S3 based on the latest logic.
For other data types (bookmarks, logos), use the appropriate flags or run without flags to update all data types.

