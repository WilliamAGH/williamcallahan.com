# Docker Deployment Guide

Production runs as **two containers built from this repository**:

| Container | Dockerfile             | Entrypoint                | Runs                                                                                                              |
| --------- | ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Web       | `Dockerfile`           | `scripts/entrypoint.sh`   | Next.js server only                                                                                               |
| Scheduler | `scheduler/Dockerfile` | `scheduler/entrypoint.sh` | Initial Node data bootstrap, web-cache revalidation, sitemap submission, and cron jobs (`scheduler/scheduler.ts`) |

Both entrypoints share the DATABASE_URL rewrite + readiness gate via `scripts/entrypoint-db-gate.sh`.

## Node Runtime

`package.json` is the canonical Node runtime manifest: `engines.node` declares the
exact version and `runtime.node.linux` declares the architecture checksums. Both
Dockerfiles parse it with `jq`; each `node` stage supplies the current Node.js 24.18.0
projection to its descendant stages. It downloads the official Node archive for the
target architecture, checks it against the matching fixed
SHA-256 in Node's
[24.18.0 `SHASUMS256.txt`](https://nodejs.org/dist/v24.18.0/SHASUMS256.txt), and rejects
unsupported architectures. Do not replace that stage with a floating NodeSource
`node_*.x` channel or application-level compatibility code.

Coolify exposes build-time variables as BuildKit secrets. The web Dockerfile mounts
public build configuration as canonical files under `/run/secrets/build`, then promotes
only present values before `bun run build`. This preserves ordinary `--build-arg` values
when the corresponding optional secret is absent.

## Web Release Identity

The web `Dockerfile` owns how a production release identity reaches `next build`. Enable
Coolify's **Include Source Commit in Build** setting so it supplies the official
`SOURCE_COMMIT` build argument. That SHA becomes both the build identity and the
`org.opencontainers.image.revision` label. When `SOURCE_COMMIT` is absent, Docker creates and
logs a UUID deployment identity; the OCI revision label stays `unknown` because no source
revision was supplied. The build exports its selected identity as both `GIT_HASH` and
`NEXT_DEPLOYMENT_ID` before `next build`. When `next start` reloads `next.config.ts` in the
Git-free runner, the configuration reuses the immutable `.next/BUILD_ID` produced by that image.

Next.js therefore uses one identity for both `generateBuildId` and the `?dpl=<release-id>`
suffix on advertised JavaScript assets. A same-`SOURCE_COMMIT` rebuild intentionally retains
its `dpl` value; the UUID path changes on every uncached image build. Recovery from an already
cached bad asset requires a Cloudflare purge or a build with a new identity. Do not replace this
identity with a fixed package-version value or configure a Cloudflare cache key that ignores the
`dpl` query. Coolify documents `SOURCE_COMMIT` and the setting at
[Dockerfile Build Pack](https://coolify.io/docs/applications/build-packs/dockerfile).

After deployment, configure the web Coolify resource's Post Deployment Command to run
`bun run deploy:smoke-test -- "$NEXT_PUBLIC_SITE_URL" --expected-release-id="$(cat .next/BUILD_ID)"`.
The smoke test fails unless
`/investments` advertises one shared nonempty deployment ID and every advertised script
loads successfully through the public Cloudflare URL. It verifies JavaScript only; it does
not inspect CSS assets.

## Cloudflare Cache Rules

`infra/cloudflare/cache-rules.json` is the declarative Cache Rules owner, validated by
`infra/cloudflare/cache-rules.schema.json`. Preview the live diff before applying it, then deploy
the same configuration:

```bash
bun run deploy:cf-cache-rules:dry-run
bun run deploy:cf-cache-rules
```

Both commands load `.env` when present and require `CF_ZONE_ID` plus the recommended scoped
`CF_API_TOKEN` (Zone > Cache Rules > Edit). The only supported alternative is
`CLOUDFLARE_API_KEY` together with `CLOUDFLARE_EMAIL`.

The pin fixes production failures with
`controller[kState].transformAlgorithm is not a function`. Node
[issue #62036](https://github.com/nodejs/node/issues/62036) identifies the Web
`TransformStream` cancel/write race; Node [pull request #62040](https://github.com/nodejs/node/pull/62040)
fixes it. The repair shipped in Node 24.15.0 and remains present in the pinned
[24.18.0 LTS release](https://nodejs.org/en/blog/release/v24.18.0). The runtime upgrade
is the repair; do not add retries, polyfills, or error suppression around the application
stream path.

For a runtime update, change `package.json`'s version and both architecture checksums
together from the matching official release manifest, then verify each projected stage
before deploying:

```bash
docker buildx build --target node --build-arg BASE_REGISTRY=docker.io/library --load \
  -t williamcallahan-com-node-runtime-check:24.18.0 .
docker run --rm williamcallahan-com-node-runtime-check:24.18.0 node --version
docker buildx build --target node --build-arg BASE_REGISTRY=docker.io/library --load \
  -f scheduler/Dockerfile -t williamcallahan-scheduler-node-runtime-check:24.18.0 .
docker run --rm williamcallahan-scheduler-node-runtime-check:24.18.0 node --version
```

## Scheduler Service (Coolify)

The scheduler deploys as a **separate Coolify resource** on the same host, using the
same environment variable set as the web app (`DATABASE_URL`, `S3_*`, `BOOKMARK_*`,
`GITHUB_*`, `GOOGLE_SEARCH_INDEXING_*`, `NEXT_PUBLIC_SITE_URL`, `API_BASE_URL`,
`NEXT_PUBLIC_S3_CDN_URL`, ...). For the current Coolify scheduler resource:

```text
NEXT_PUBLIC_SITE_URL=https://williamcallahan.com
API_BASE_URL=https://williamcallahan.com
NEXT_PUBLIC_S3_CDN_URL=https://s3-storage.callahan.cloud
INTERNAL_DATABASE_HOST=100.86.115.120
INTERNAL_DATABASE_PORT=5438
```

Two options:

1. **Docker Compose buildpack** (preferred — carries CPU/memory limits): Base Directory `/`,
   Compose file `scheduler/docker-compose.yml`. The service caps at 1 CPU / 3G so batch
   jobs can never saturate the 2-core host alongside the web app. Coolify invokes compose
   with the repo root as `--project-directory`, so the compose build context must stay `.`.
2. **Dockerfile buildpack**: Base Directory `/`, Dockerfile location `scheduler/Dockerfile`
   (set CPU/memory limits in the Coolify resource settings instead).

Keep the scheduler resource's Coolify Build Server option disabled. The compose
resource has no registry image configured, and Coolify 4.1.2 must execute the
helper/build path on `popos-sf1`; routing this resource through the global build
server (`popos-sf5`) fails before the build phase when Coolify tries to `docker exec`
the deployment helper.

The scheduler image does **not** run `next build` — it installs dependencies and runs
TypeScript directly via tsx, so its builds take minutes, not tens of minutes. No ports
are exposed. Docker allows 15 minutes for startup work; afterward, health requires the
scheduler heartbeat to be no more than two minutes old.

Scheduler startup waits for the database gate, then runs `node --run update-data` with no
operation flags. When endpoint-compatible embeddings are enabled, startup first verifies that
migration `0024_embedding-failures` has created `public.embedding_failures` and fails with an
explicit migration error before bootstrap if it is missing. Bootstrap processes at most one
canonical bookmark embedding batch; later data-updater cycles drain due checkpoints. The data
updater owns the default operation set, including books and search indexes. The scheduler next
reuses its canonical authenticated endpoint inventory to invalidate
bookmark, books, and GitHub web caches before sitemap submission and cron. A bootstrap or cache
revalidation failure logs an error and exits instead of serving stale data; the compose service's
`unless-stopped` restart policy retries it.

Local build + one-shot data prefetch:

```bash
bun run docker:build:scheduler
bun run docker:prefetch
```

## Quick Start

Run the web container locally:

```bash
docker build -t williamcallahan-com .
docker run -d -p 3000:3000 --name williamcallahan-com williamcallahan-com
```

## Health Checks

- **Application Health**: `curl http://localhost:3000/api/health`

## Production Database Startup Safeguards

When `NEXT_PUBLIC_SITE_URL=https://williamcallahan.com`, startup applies two safeguards:

1. `DATABASE_URL` is rewritten from the public proxy endpoint (`167.234.219.57:5438`) to the internal PostgreSQL service (`q0kks8ww044c0o4w4o4ok408:5432`).
2. The app startup is gated until the resolved database endpoint is reachable.

If PostgreSQL runs on another Tailscale-connected host, set `INTERNAL_DATABASE_HOST`
and `INTERNAL_DATABASE_PORT`; those values replace the default internal service target.
