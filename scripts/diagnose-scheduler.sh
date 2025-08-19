#!/bin/bash

echo "=== SCHEDULER DIAGNOSTIC REPORT ==="
echo "Generated at: $(date)"
echo ""

echo "1. PROCESS CHECK:"
echo "   Checking for scheduler process..."
SCHEDULER_PROCS=$(ps aux | grep -E "bun.*scheduler|node.*scheduler" | grep -v grep)
if [ -n "$SCHEDULER_PROCS" ]; then
    echo "   ✅ Scheduler process found:"
    echo "$SCHEDULER_PROCS" | sed 's/^/      /'
else
    echo "   ❌ No scheduler process found"
fi
echo ""

echo "2. SCHEDULER LOG CHECK:"
if [ -f /tmp/scheduler.log ]; then
    echo "   ✅ Scheduler log exists at /tmp/scheduler.log"
    echo "   Last 20 lines:"
    tail -20 /tmp/scheduler.log | sed 's/^/      /'
else
    echo "   ❌ No scheduler log found at /tmp/scheduler.log"
fi
echo ""

echo "3. ENVIRONMENT VARIABLES:"
echo "   Critical variables for scheduler:"
echo "      S3_BUCKET: ${S3_BUCKET:-❌ NOT SET}"
echo "      BOOKMARKS_LIST_ID: ${BOOKMARKS_LIST_ID:-❌ NOT SET}"
echo "      BOOKMARK_BEARER_TOKEN: $([ -n "$BOOKMARK_BEARER_TOKEN" ] && echo "✅ SET" || echo "❌ NOT SET")"
echo "      BOOKMARKS_API_URL: ${BOOKMARKS_API_URL:-https://karakeep.com/api}"
echo ""

echo "4. CRON SCHEDULES:"
echo "   S3_BOOKMARKS_CRON: ${S3_BOOKMARKS_CRON:-0 */2 * * * (default)}"
echo "   S3_GITHUB_CRON: ${S3_GITHUB_CRON:-0 0 * * * (default)}"
echo "   S3_LOGOS_CRON: ${S3_LOGOS_CRON:-0 1 * * 0 (default)}"
echo ""

echo "5. FILE SYSTEM CHECK:"
echo "   Checking required files..."
[ -f package.json ] && echo "   ✅ package.json exists" || echo "   ❌ package.json missing"
[ -f lib/server/scheduler.ts ] && echo "   ✅ scheduler.ts exists" || echo "   ❌ scheduler.ts missing"
[ -d node_modules ] && echo "   ✅ node_modules exists" || echo "   ❌ node_modules missing"
[ -d node_modules/node-cron ] && echo "   ✅ node-cron installed" || echo "   ❌ node-cron not installed"
echo ""

echo "6. BUN/NODE CHECK:"
which bun > /dev/null 2>&1 && echo "   ✅ bun found at: $(which bun)" || echo "   ❌ bun not found"
which node > /dev/null 2>&1 && echo "   ✅ node found at: $(which node)" || echo "   ❌ node not found"
echo ""

echo "7. RECENT S3 ACTIVITY:"
echo "   Checking for recent bookmark updates..."
# Try to check S3 logs or recent file modifications
find /app/cache -name "*.json" -mtime -1 2>/dev/null | head -5 | sed 's/^/      /' || echo "      No recent cache updates"
echo ""

echo "8. CONTAINER UPTIME:"
uptime
echo ""

echo "9. MEMORY STATUS:"
free -h 2>/dev/null || echo "   Memory info not available"
echo ""

echo "10. ATTEMPTING MANUAL SCHEDULER START:"
echo "    Running: bun run scheduler --version"
timeout 5 bun run scheduler --version 2>&1 | sed 's/^/      /' || echo "      Command timed out or failed"
echo ""

echo "=== DIAGNOSTIC RECOMMENDATIONS ==="
if [ -z "$SCHEDULER_PROCS" ]; then
    echo "⚠️  Scheduler is not running. Try:"
    echo "   1. Check /tmp/scheduler.log for startup errors"
    echo "   2. Manually run: bun run scheduler"
    echo "   3. Check if required environment variables are set"
fi

if [ ! -f /tmp/scheduler.log ]; then
    echo "⚠️  No scheduler log found. The scheduler may have never started."
    echo "   Check the entrypoint script output during container startup."
fi

echo ""
echo "=== END DIAGNOSTIC REPORT ===">