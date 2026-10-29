#!/usr/bin/env bash
#
# scripts/build-and-push.sh
#
# Multi-arch build and push script for tlgrange/pixxel247.
# Builds arm64 natively on Apple Silicon and amd64 via Rosetta/QEMU.
#
# Usage:
#   ./scripts/build-and-push.sh          # auto-computed next X.Y version + latest
#   ./scripts/build-and-push.sh 1.0      # explicit version + latest

set -euo pipefail

IMAGE_NAME="tlgrange/pixxel247"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Verify (tsc)"
SQLITE_DATABASE_URL="file:/tmp/pixxel247-build.db" npm run db:generate
npx tsc --noEmit

echo "==> Determine version tag"
if [ "${1:-}" != "" ]; then
  VERSION="$1"
  echo "Using explicit version: $VERSION"
else
  TAGS_JSON="$(curl -sf "https://hub.docker.com/v2/repositories/${IMAGE_NAME}/tags?page_size=100" || echo '{"results":[]}')"
  VERSION="$(python3 -c "
import json, re
try:
    data = json.loads('''$TAGS_JSON''')
    versions = []
    for r in data.get('results', []):
        m = re.fullmatch(r'(\d+)\.(\d+)', r.get('name', ''))
        if m:
            versions.append((int(m.group(1)), int(m.group(2))))
    if not versions:
        print('1.0')
    else:
        versions.sort()
        major, minor = versions[-1]
        print(f'{major}.{minor + 1}')
except Exception:
    print('1.0')
")"
  echo "Computed next version: $VERSION"
fi

echo "==> Ensure a multi-platform-capable builder is active"
docker buildx inspect --bootstrap > /dev/null

echo "==> Build and push ${IMAGE_NAME}:${VERSION} + :latest (linux/amd64, linux/arm64)"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${IMAGE_NAME}:${VERSION}" \
  -t "${IMAGE_NAME}:latest" \
  --push \
  .

echo "==> Done: pushed ${IMAGE_NAME}:${VERSION} and ${IMAGE_NAME}:latest"
