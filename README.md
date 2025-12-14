# William Callahan's Personal Website

> Run tests with `bun run test` (Jest), not `bun test`.

Repo for [williamcallahan.com](https://williamcallahan.com). Code at [github.com/WilliamAGH/williamcallahan.com](https://github.com/WilliamAGH/williamcallahan.com).

## Logo Caching

Three-tier caching for company logos:

1. **Memory** — Clears on restart
2. **Filesystem** — `/app/data/images/logos` in container. Persists with Docker volume, otherwise ephemeral. Format: `{md5(domain)}-{source}.png`
3. **External** — Fetches from Google, Clearbit, DuckDuckGo. Validates against placeholder detection, converts to PNG

### Persistent Logo Storage

Volume: `logo_storage` -> `/app/data/images/logos`

```bash
docker volume create logo_storage
docker run -v logo_storage:/app/data/images/logos williamcallahan-website
docker run --rm -v logo_storage:/data alpine chown -R 1001:1001 /data  # fix permissions
```

## Running the Site

### Docker (ephemeral logos)

```bash
docker build -t williamcallahan-website .
docker run -d -p 3000:3000 --name williamcallahan-website williamcallahan-website
```

### Docker (persistent logos)

```bash
docker volume create logo_storage
docker build -t williamcallahan-website .
docker run -d -p 3000:3000 -v logo_storage:/app/data/images/logos --name williamcallahan-website williamcallahan-website
```

## Terminal Component

Interactive terminal with:

- **Command History** — SessionStorage persistence
- **Window Controls** — macOS-style (close, minimize, maximize)
- **Maximize Mode** — Full-screen, dismiss via click-outside or Escape
- **Navigation** — `home`, `blog`, `experience`, etc.
- **Section Search** — `blog <query>`, `investments <query>`, etc.
- **Commands** — `help`, `clear`, `schema.org` (structured data)

State: React Context for history, global state for window position.

### Cache Management

Clear in-memory: `curl -X POST http://localhost:3000/api/cache/clear`

Reset disk cache:

```bash
docker stop williamcallahan-website
docker volume rm logo_storage && docker volume create logo_storage
docker start williamcallahan-website
```

### Backup/Restore Logos

```bash
docker run --rm -v logo_storage:/data:ro -v "$(pwd):/backup" alpine tar czf /backup/logos-backup-$(date +%Y%m%d).tar.gz -C /data .
docker run --rm -v logo_storage:/data -v "$(pwd):/backup" alpine sh -c "tar xzf /backup/logos-backup-YYYYMMDD.tar.gz -C /data && chown -R 1001:1001 /data"
```

Health check: `curl http://localhost:3000/api/health`

## Local Development

Ignore auto-generated files: `git update-index --skip-worktree config/csp-hashes.json lib/data/slug-mapping.json`

Revert: `git update-index --no-skip-worktree config/csp-hashes.json lib/data/slug-mapping.json`

## Data Refresh

### GitHub Activity

Force refresh: `bun run update-s3 -- --github`

### Bookmark System

S3 storage with environment-specific paths (production: no suffix, development: `-dev`).

**Automatic**: Scheduler runs every 2 hours (`0 */2 * * *`) via `lib/server/scheduler.ts`

**Manual**: `bun run bookmarks:refresh:dev` / `bookmarks:refresh:prod` / `bookmarks:metadata:dev` / `bookmarks:metadata:prod`

### Environment Detection

Priority: `DEPLOYMENT_ENV` > URL detection (`API_BASE_URL`/`NEXT_PUBLIC_SITE_URL`) > `NODE_ENV`

`.env` defaults to `DEPLOYMENT_ENV=development`. Package scripts override automatically.

### Data Updater CLI

`bun run update-s3 -- --bookmarks --github --logos --search-indexes`

**Data flags**: `--bookmarks`, `--github`, `--logos`, `--search-indexes`

**Options**: `--force`, `--testLimit=N`, `--metadata-only`, `--metadata-limit N`

No flags = all operations.

### S3 Key Paths

Environment suffix from `lib/config/environment.ts`: production (none), test (`-test`), development (`-dev`).

See `lib/constants.ts` for path definitions (`BOOKMARKS_S3_PATHS`, `CONTENT_GRAPH_S3_PATHS`, `SEARCH_S3_PATHS`, `GITHUB_ACTIVITY_S3_PATHS`, `IMAGE_MANIFEST_S3_PATHS`).

**Quick reference**: `bun run update-s3 -- --force` (full) | `bun run update-s3 -- --bookmarks` (single) | `bun run scheduler` (production)
