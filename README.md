# williamcallahan.com

![williamcallahan.com project preview](public/images/williamcallahan-com-project.png)

A personal website monorepo featuring a terminal-inspired UI, semantic search, and an automated content pipeline. Built with Next.js 16, React 19, and TypeScript.

## Quick Start

### Local Development

```bash
# Install dependencies
bun install

# Start development server
bun dev
```

### Docker Deployment

```bash
docker build -t williamcallahan-com .
docker run -d -p 3000:3000 williamcallahan-com
```

For production deployment with persistent storage, see the [Docker Deployment Guide](docs/operations/docker-deployment-guide.md).

## Documentation

- **Architecture Overview**: [Entry Point](docs/projects/structure/00-architecture-entrypoint.md)
- **File Structure Map**: [File Overview](docs/projects/file-overview-map.md)
- **Agent Rules**: [AGENTS.md](AGENTS.md)

## Operations & Runbooks

- [Docker Deployment Guide](docs/operations/docker-deployment-guide.md)
- [Data Pipeline Operations](docs/operations/data-pipeline-operations.md)
- [Logo Cache Operations](docs/operations/logo-cache-operations.md)

## Core Features

- **Terminal UI**: Interactive terminal with filesystem-like navigation and command history.
- **Content Pipeline**: Automated ingestion of bookmarks, GitHub activity, and blog posts to S3.
- **Semantic Search**: Vector-based search for content and bookmarks.
- **Logo Caching**: 3-tier caching system (Memory -> Disk -> External) for company logos.

## License

[MIT](LICENSE)
