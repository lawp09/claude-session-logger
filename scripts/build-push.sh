#!/usr/bin/env bash
set -euo pipefail

REGISTRY="ghcr.io/lawp09/csl-web"
DOCKERFILE="apps/web/Dockerfile"
DRY_RUN=false
TAG=""

usage() {
  echo "Usage: $0 [--dry-run] [--tag <tag>]"
  echo "  --dry-run   Build only, do not push"
  echo "  --tag <tag> Additional tag (default: latest + git sha)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# Resolve git sha
GIT_SHA=$(git rev-parse --short HEAD)

# Build tags
TAGS=("-t" "${REGISTRY}:latest" "-t" "${REGISTRY}:${GIT_SHA}")
if [[ -n "$TAG" ]]; then
  TAGS+=("-t" "${REGISTRY}:${TAG}")
fi

echo "Building ${REGISTRY}:${GIT_SHA} ..."
docker build -f "$DOCKERFILE" "${TAGS[@]}" .

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run: skipping push"
  exit 0
fi

# Login to GHCR
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u lawp09 --password-stdin
elif command -v gh &>/dev/null; then
  gh auth token | docker login ghcr.io -u lawp09 --password-stdin
else
  echo "Error: GITHUB_TOKEN not set and gh CLI not available"
  exit 1
fi

echo "Pushing ${REGISTRY}:latest and ${REGISTRY}:${GIT_SHA} ..."
docker push "${REGISTRY}:latest"
docker push "${REGISTRY}:${GIT_SHA}"
if [[ -n "$TAG" ]]; then
  docker push "${REGISTRY}:${TAG}"
fi

echo "Done."
