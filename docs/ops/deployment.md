# Docker Deployment Guide

Production runs as **two containers built from this repository**:

| Container | Dockerfile             | Entrypoint                | Runs                                                                                                              |
| --------- | ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Web       | `Dockerfile`           | `scripts/entrypoint.sh`   | Next.js server only                                                                                               |
| Scheduler | `scheduler/Dockerfile` | `scheduler/entrypoint.sh` | Initial Node data bootstrap, web-cache revalidation, sitemap submission, and cron jobs (`scheduler/scheduler.ts`) |

Both entrypoints share the DATABASE_URL rewrite + readiness gate via `scripts/entrypoint-db-gate.sh`.

## Graceful Shutdown

Image deployment identity includes the configured runtime environment as well as the image
and revision labels. Correcting a runtime vault reference therefore submits a new deployment,
instead of returning an earlier failed deployment for the same image. Configuration is hashed
inside the deployment process and is never printed or passed as command-line arguments.

Scheduler bootstrap requires all three `AUDIOBOOKSHELF_*` settings already used by the web
application: `URL`, `API_KEY`, and `LIBRARY_ID`. Wire their existing production vault references
into the scheduler's Dokploy environment; do not replace a missing dependency with an empty
books/index success or disable the bootstrap health gate.

Each `CMD` invokes the real long-running program so that `exec "$@"` leaves it as PID 1:
`node ./node_modules/next/dist/bin/next start` for web, `node --import tsx
scheduler/scheduler.ts` for the scheduler. Neither may be wrapped in `node --run <script>`
or the `tsx` CLI. Both fork the script and register no signal handler of their own, and
Linux discards a signal sent to a PID 1 whose disposition is still the default — so SIGTERM
would be dropped and the container would idle until SIGKILL.

With the server as PID 1, Next.js installs its own SIGTERM handler
(`node_modules/next/dist/server/lib/start-server.js`, active because `NEXT_MANUAL_SIG_HANDLE`
is unset): it stops accepting connections, drains in-flight requests, and exits 143. An idle
server releases its socket in about 10 ms, well inside Docker's 10-second default stop grace
period.

`scheduler/scheduler.ts` installs the equivalent handler: it stops the node-cron tasks,
cancels pending jitter timers, and waits for an in-flight `update-data` child before exiting.
`scheduler/entrypoint.sh` traps SIGTERM for the pre-`exec` bootstrap window, which the
15-minute healthcheck start period bounds, and runs each long step in the background so bash
can act on the trap instead of deferring it.

## Node Runtime

`package.json` is the canonical Node runtime manifest: `engines.node` declares the
exact version and `runtime.node.linux` declares the architecture checksums. Both
Dockerfiles parse it with `jq`; each `node` stage supplies the current Node.js 24.22.1
projection to its descendant stages. It downloads the official Node archive for the
target architecture, checks it against the matching fixed
SHA-256 in Node's
[24.22.1 `SHASUMS256.txt`](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt), and rejects
unsupported architectures. Do not replace that stage with a floating NodeSource
`node_*.x` channel or application-level compatibility code.

Production builds in `.github/workflows/deploy.yml` resolve `infisical-wc-prod` vault
references into BuildKit secrets. The web Dockerfile mounts public build configuration as canonical files under
`/run/secrets/build`, then promotes only present values before `pnpm run build`. This
preserves ordinary `--build-arg` values when the corresponding optional secret is absent.

## Web Release Identity

The web `Dockerfile` derives the production release identity from the checked-out Git
`HEAD`; unavailable Git metadata is a build failure. The build exports that identity as both
`GIT_HASH` and `NEXT_DEPLOYMENT_ID` before `next build`, then writes it to
`/app/.next/RELEASE_ID`. That file sits inside `.next`, which the runtime stage already
copies wholesale, so it needs no separate `COPY` and no build argument. When `next start`
reloads `next.config.ts` in the Git-free runner, the configuration reads that file.

Do not reintroduce a `.next/BUILD_ID` fallback. Despite `generateBuildId: async () => releaseId`,
the built image's `BUILD_ID` is a Next-generated value unrelated to the release — measured as
`build-TfctsWXpff2fKS` across a local checkout and two unrelated production images. Because the
runner has neither `NEXT_DEPLOYMENT_ID` nor `.git`, that fallback was taken on every production
start and returned an id matching no commit, which `applyReleaseEnvironment` then assigned to
`NEXT_DEPLOYMENT_ID`, `NEXT_PUBLIC_GIT_HASH` and `SENTRY_RELEASE` (fixed 2026-09-18, `c0d0bbb6`).
A same-source-revision rebuild intentionally retains its `dpl` value. For native Dokploy deployments, prove that revision with the deployment's
recorded Git revision and the image's `.next/RELEASE_ID`. Scheduler deployments have no public
build ID, so prove their recorded Git revision, running image digest, and heartbeat together.
Recovery from an already cached bad asset requires a Cloudflare purge or a build with a new
identity. Do not replace this identity with a fixed package-version value or configure a
Cloudflare cache key that ignores the `dpl` query.

After deployment, run
`pnpm run deploy:smoke-test -- "$NEXT_PUBLIC_SITE_URL" --expected-release-id="$(cat .next/RELEASE_ID)"`
from the deployed web image or pass its recorded release ID explicitly. The smoke test fails unless
`/investments` advertises one shared nonempty deployment ID and every advertised script and
stylesheet loads successfully through the public Cloudflare URL with its JavaScript or CSS
content type.

## Static asset archive

Swarm's start-first rollout serves old and new web replicas side by side, and Traefik spreads
requests across them. A document one release rendered can therefore request a hashed
`/_next/static/chunks` or `/_next/static/media` file that only the other release's image holds. Every release renames at
least one stylesheet, because its font URLs embed the `dpl` release id; before the archive, that
request returned `404` and the page rendered unstyled until a reload.

- The web image build runs `scripts/archive-static-assets.ts` right after `next build`. It copies
  supported public chunk and media files to the CDN bucket at their same `_next/static/<kind>/<path>`
  key, with `Cache-Control: public, max-age=31536000, immutable`. A failed copy fails the build,
  so the archive holds a release's files before any of its replicas serve. Source maps and unsupported/private output are not published.
- `next.config.ts` `rewrites().fallback` sends a missing `/_next/static/chunks/:path*` or
  `/_next/static/media/:path*` request the
  replica's filesystem cannot answer to `src/app/api/static-archive/[...path]/route.ts`, which
  fetches the public file from `NEXT_PUBLIC_S3_CDN_URL` under a 10 s total deadline. The browser keeps
  the same relative URL, so no `assetPrefix` is involved and copied-HTML renderers (TRMNL) are
  unaffected. The handler sends no visitor cookies to the CDN, answers an archived chunk with the
  immutable header, an absent one with `404` and Next's own `no-store` header, and a timeout or
  upstream error with an uncacheable `503`.
- Media is retained alongside chunks, including hashed images and fonts. Fonts retain the CORS
  behavior needed by copied HTML. An old hash whose original bytes were never archived remains
  a truthful, uncacheable404; do not upload a guessed immutable alias.
- A replica relays only through its own configuration, so a release's old replicas cover the new
  release's chunks once the release before it carried this rewrite.
- The `linux/amd64` and `linux/arm64` builds of one commit emit partly different chunk names
  (release `45bab86`: 67 of 70 arm64 chunks matched amd64), so a document from a replica of one
  architecture can request a chunk only the other architecture's replicas hold, outside any
  rollout too. Each platform build archives its own chunks, so the relay covers that case. A name
  both builds produce carries the same content hash, so the second copy writes identical bytes.
  Archived files are never deleted. A `404` or `500` from a missing chunk is never stored at the
  edge by the `/_next/static` Cache Rule below.

Next's built-in skew protection (`deploymentId` routing) needs a version-pinned router; Traefik
routes by service, not by the `dpl` query, so it is not used here [IO0e].

## Cloudflare Cache Rules

The optimized-image rule keys raw `Accept` variants whenever Next emits `Vary: Accept`,
normalizes encoding, and bypasses unexpected Vary fields. This uses general Cache Rules Vary
(available on Free), not paid extension-based Vary for Images. AVIF and WebP clients must never
share a negotiated representation. The OG redirect rule respects origin cache headers so
terminal failure placeholders marked no-store do not become a day-long cached outage.

`infra/cloudflare/cache-rules.json` is the declarative Cache Rules owner, validated by
`infra/cloudflare/cache-rules.schema.json`. Preview the live diff before applying it, then deploy
the same configuration:

```bash
pnpm run deploy:cf-cache-rules:dry-run
pnpm run deploy:cf-cache-rules
```

Both commands load `.env` when present and require `CF_ZONE_ID` plus the recommended scoped
`CF_API_TOKEN` (Zone > Cache Rules > Edit). The only supported alternative is
`CLOUDFLARE_API_KEY` together with `CLOUDFLARE_EMAIL`.

The pin fixes production failures with
`controller[kState].transformAlgorithm is not a function`. Node
[issue #62036](https://github.com/nodejs/node/issues/62036) identifies the Web
`TransformStream` cancel/write race; Node [pull request #62040](https://github.com/nodejs/node/pull/62040)
fixes it. The repair shipped in Node 24.15.0 and remains present in the pinned
[24.22.1 LTS release](https://nodejs.org/en/blog/release/v24.22.1). The runtime upgrade
is the repair; do not add retries, polyfills, or error suppression around the application
stream path.

For a runtime update, change `package.json`'s version and both architecture checksums
together from the matching official release manifest, then verify each projected stage
before deploying:

Both Dockerfiles require `BASE_REGISTRY`, the Infisical key of the same name in project
`williamcallahan-com`; run these inside `infisical run --projectId <project id> --env prod -- bash` so it is set:

```bash
docker buildx build --target node --build-arg BASE_REGISTRY="${BASE_REGISTRY:?}" --load \
  -t williamcallahan-com-node-runtime-check:24.22.1 .
docker run --rm williamcallahan-com-node-runtime-check:24.22.1 node --version
docker buildx build --target node --build-arg BASE_REGISTRY="${BASE_REGISTRY:?}" --load \
  -f scheduler/Dockerfile -t williamcallahan-scheduler-node-runtime-check:24.22.1 .
docker run --rm williamcallahan-scheduler-node-runtime-check:24.22.1 node --version
```

## Multi-platform image pipeline

`.github/workflows/deploy.yml` publishes one `linux/amd64` + `linux/arm64` image index per
deployable to `<IMAGE_REGISTRY>/williamcallahan/williamcallahan-com-{web,scheduler}` and
deploys it to Dokploy by digest. Dokploy's native Dockerfile build emits a single-platform
image, so ARM64 hosts need this publisher.

- Each platform builds natively (`ubuntu-24.04`, `ubuntu-24.04-arm`) and pushes by digest;
  `publish_and_deploy` joins the digests with `docker buildx imagetools create` and tags
  `<branch>-<sha>` plus `<branch>`.
- Every platform image carries `org.opencontainers.image.revision=<github.sha>`; the deploy
  script refreshes `otel.service.version` to that commit while preserving other application labels.
- A push to `dev` deploys the web image to the GitHub `development` environment; a push to
  `main` deploys web and scheduler to `production`. `DOKPLOY_APPLICATION_ID` (and, in
  production, `DOKPLOY_SCHEDULER_APPLICATION_ID`) are GitHub environment variables.
- Registry hostnames live only in Infisical project `williamcallahan-com`: `IMAGE_REGISTRY`
  receives the pushed images and `BASE_REGISTRY` serves the base images, in both `dev` and
  `prod`. No repository file, GitHub secret, or GitHub variable holds a registry hostname.
- Every job reads Infisical over GitHub OIDC with the identity bound to its GitHub environment:
  `github-actions-williamcallahan-com-production` (`5816c153-bc1f-4b51-a879-995bffba176b`)
  reads `prod` for `production`, and `github-actions-williamcallahan-com-development`
  (`ff932f6a-e086-443f-b27f-f884c91f37a7`) reads `dev` for `development`.
- Each build reads `buildArgs` and `buildSecrets` from the Dokploy application it deploys
  to, so Dokploy stays their owner. A `${{vault.infisical-wc-prod.KEY}}` (main) or
  `${{vault.infisical-wc-dev.KEY}}` (dev) reference, `BASE_REGISTRY` included, resolves from
  the job's Infisical step; any other vault reference fails the build. Plaintext
  build-secret copies are not stored in GitHub.
- `scripts/dokploy-deploy-image.sh` switches the application to `sourceType: docker` with the
  exact `<tag>@<digest>` reference, deploys it, waits for the deployment row, then waits until
  consecutive uncached requests all advertise `dpl=<short sha>`.

## Production Control Plane (Dokploy)

Dokploy project `BMXTsKla8_lsB6n63EqFT`, production environment
`Twbm9C6LWHx9U5K6GxHuj`, owns both production applications:

| Application | ID                      | Git source | Replicas | Resources                                                                |
| ----------- | ----------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| Web         | `bUgv7h_BN9tuULqqZjmRp` | `main`     | 2        | 10 GiB memory limit, 8 GiB reservation, no CPU limit or CPU reservation  |
| Scheduler   | `OUteyEQrGINFHwCyYMVUa` | `main`     | 1        | 1 CPU limit, 3 GiB memory limit, 512 MiB reservation, no CPU reservation |

The image workflow above disables native Git push builds and deploys the published digest.
Only nodes labeled `williamcallahan.com.production=true` are eligible; `MaxReplicas: 1`
keeps the two web replicas on different nodes. Live updates and rollbacks use `start-first`;
read the current Dokploy/Swarm policy before planning rollout overlap rather than assuming
an older documented placement or update order.

`infisical-wc-prod` (`DmhmwE6WCLgWnnieZuPso`) is the production configuration
owner. Dokploy stores only `${{vault.infisical-wc-prod.KEY}}` references; never copy
secret values into an application environment, build argument, repository file, or
deployment command. The provider assignment to the project and production environment
is the attachment for both applications.

The retained Coolify web (`d4oco0ck4o80g8skokgwcsk0`) and scheduler
(`wmegirwbmj6ahx0pkzhqvi9l`) records are rollback sources only. Keep them stopped after
the DNS cutover; do not delete them or re-enable their source deployment automation.

## Scheduler Service

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
revalidation failure logs an error and exits instead of serving stale data; Swarm restarts the
failed task according to the Dokploy service policy.

Local build + one-shot data prefetch:

```bash
pnpm run docker:build:scheduler
pnpm run docker:prefetch
```

## Quick Start

Run the web container locally with `BASE_REGISTRY` set (Infisical key of the same name; the
`docker:build` scripts and the scheduler Compose file read it from the environment too):

```bash
docker build --build-arg BASE_REGISTRY -t williamcallahan-com .
docker run -d -p 3000:3000 --name williamcallahan-com williamcallahan-com
```

## Health Checks

- **Application Health**: `curl http://localhost:3000/api/health`

## Database Startup Safeguards

Every web and scheduler runtime (production, development, preview) applies two safeguards at startup:

1. `DATABASE_URL` is rewritten from the public proxy endpoint to the
   `INTERNAL_DATABASE_HOST` and `INTERNAL_DATABASE_PORT` tailnet route supplied by the
   environment's Infisical provider (`infisical-wc-prod` or `infisical-wc-dev`). A runtime whose
   `DATABASE_URL` names the public proxy without those two values exits at startup. Only
   off-tailnet GitHub-hosted builds use the public listener (`.github/workflows/deploy.yml`).
2. The app startup is gated until the resolved database endpoint is reachable.

The stopped rollback records retain their former service-name default. Dokploy production must
keep the explicit direct-tailnet host and port references.
