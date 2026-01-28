# Docker Deployment Guide

## Quick Start (Ephemeral)

Run the container with ephemeral storage (logos clear on restart):

```bash
docker build -t williamcallahan-com .
docker run -d -p 3000:3000 --name williamcallahan-com williamcallahan-com
```

## Production Setup (Persistent)

For production, mount a volume to persist downloaded logos:

```bash
# 1. Create storage volume
docker volume create logo_storage

# 2. Build image
docker build -t williamcallahan-com .

# 3. Run with volume mount
docker run -d \
  -p 3000:3000 \
  -v logo_storage:/app/data/images/logos \
  --name williamcallahan-com \
  williamcallahan-com
```

## Maintenance Operations

### Fix Permissions

If you encounter permission issues with the volume:

```bash
docker run --rm -v logo_storage:/data alpine chown -R 1001:1001 /data
```

### Backup Logos

Create a tarball of the logo storage:

```bash
docker run --rm -v logo_storage:/data:ro -v "$(pwd):/backup" alpine \
  tar czf /backup/logos-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Logos

Restore from a backup tarball:

```bash
docker run --rm -v logo_storage:/data -v "$(pwd):/backup" alpine \
  sh -c "tar xzf /backup/logos-backup-YYYYMMDD.tar.gz -C /data && chown -R 1001:1001 /data"
```

## Health Checks

- **Application Health**: `curl http://localhost:3000/api/health`
