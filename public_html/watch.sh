#!/bin/bash
# Auto-rebuild Next.js when source files change
# Usage: bash watch.sh

cd /var/www/seravavatar-hub/public_html

BUILD_COUNT=0

echo "Watching for file changes in src/..."
while true; do
  # Wait for any file to change in src/
  inotifywait -q -e modify,create,delete -r src/ 2>/dev/null || sleep 5

  BUILD_COUNT=$((BUILD_COUNT + 1))
  echo ""
  echo "===== Change detected (#$BUILD_COUNT) - rebuilding at $(date) ====="

  # Kill old server
  sudo fuser -k 3000/tcp 2>/dev/null
  sleep 1

  # Rebuild
  npm run build >> /var/www/seravavatar-hub/logs/next-watch.log 2>&1

  # Restart server
  node_modules/.bin/next start -p 3000 >> /var/www/seravavatar-hub/logs/next.log 2>&1 &
  sleep 4

  echo "Ready!"
  echo ""
done
