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

Production Dokploy builds resolve `infisical-wc-prod` vault references into BuildKit
secrets. The web Dockerfile mounts public build configuration as canonical files under
`/run/secrets/build`, then promotes only present values before `bun run build`. This
preserves ordinary `--build-arg` values when the corresponding optional secret is absent.

## Web Release Identity

The web `Dockerfile` owns how a production release identity reaches `next build`.
Coolify's **Include Source Commit in Build** setting supplies the `SOURCE_COMMIT` build
argument, which is also used for the `org.opencontainers.image.revision` label. Native
Dokploy Git builds do not supply that build argument, so the builder derives the identity
from its checked-out Git `HEAD` instead. A missing build argument and unavailable Git metadata
is a build failure, never a UUID fallback. The build exports the selected identity as both
`GIT_HASH` and `NEXT_DEPLOYMENT_ID` before `next build`. When `next start` reloads
`next.config.ts` in the Git-free runner, the configuration reuses the immutable
`.next/BUILD_ID` produced by that image.

Next.js therefore uses one identity for both `generateBuildId` and the `?dpl=<release-id>`
suffix on advertised JavaScript assets. A same-source-revision rebuild intentionally retains
its `dpl` value. For native Dokploy deployments, prove that revision with the deployment's
recorded Git revision and the public `.next/BUILD_ID`; the OCI label is supplemental because
Dokploy does not pass `SOURCE_COMMIT`. Scheduler deployments have no public build ID, so prove
their recorded Git revision, running image digest, and heartbeat together. Recovery from an
already cached bad asset requires a Cloudflare purge or a build with a new identity. Do not
replace this identity with a fixed package-version value or configure a Cloudflare cache key
that ignores the `dpl` query. Coolify documents `SOURCE_COMMIT` and the setting at
[Dockerfile Build Pack](https://coolify.io/docs/applications/build-packs/dockerfile).

After deployment, run
`bun run deploy:smoke-test -- "$NEXT_PUBLIC_SITE_URL" --expected-release-id="$(cat .next/BUILD_ID)"`
from the deployed web image or pass its recorded release ID explicitly. The smoke test fails unless
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

## Production Control Plane (Dokploy)

Dokploy project `BMXTsKla8_lsB6n63EqFT`, production environment
`Twbm9C6LWHx9U5K6GxHuj`, owns both production applications:

| Application | ID                      | Git source | Replicas | Resources                                                                |
| ----------- | ----------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| Web         | `bUgv7h_BN9tuULqqZjmRp` | `main`     | 2        | 10 GiB memory limit, 8 GiB reservation, no CPU limit or CPU reservation  |
| Scheduler   | `OUteyEQrGINFHwCyYMVUa` | `main`     | 1        | 1 CPU limit, 3 GiB memory limit, 512 MiB reservation, no CPU reservation |

Both use the native GitHub push trigger, build on Dokploy server `haiku-5`
(`9nmaEL2XqWCSYUjB7p83V`), and publish through the hosted Nexus registry before
Swarm placement. Only nodes labeled `williamcallahan.com.production=true` are
eligible; `MaxReplicas: 1` keeps the two web replicas split across `haiku-0` and
`haiku-5`. Updates and rollbacks are `stop-first`, so the pair never requests a
third temporary slot.

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

1. `DATABASE_URL` is rewritten from the public proxy endpoint to the
   `INTERNAL_DATABASE_HOST` and `INTERNAL_DATABASE_PORT` supplied by
   `infisical-wc-prod`.
2. The app startup is gated until the resolved database endpoint is reachable.

The retained Coolify rollback source may still use its service-name default. Dokploy
production must keep the explicit direct-tailnet host and port references.
