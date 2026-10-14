#!/usr/bin/env bash

set -euo pipefail

PAGE_NAME=""
OUTPUT_DIR=""
WORKSPACE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pageName) PAGE_NAME="${2:-}"; shift 2 ;;
    --outputDir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --workspaceDir) WORKSPACE_DIR="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$PAGE_NAME" ]] || { echo "--pageName is required" >&2; exit 1; }
OUTPUT_DIR="${OUTPUT_DIR:-.vue3tokuikly-output/$PAGE_NAME}"
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"
PROGRESS_FILE="$WORKSPACE_DIR/cache/progress.md"

[[ -f "$PROGRESS_FILE" ]] || { echo "Progress file not found: $PROGRESS_FILE" >&2; exit 1; }
cat "$PROGRESS_FILE"

echo ""
echo "Generated Kotlin files:"
if [[ -d "$OUTPUT_DIR" ]]; then
  find "$OUTPUT_DIR" -type f -name '*.kt' -print | sort
else
  echo "none (output directory does not exist)"
fi

for artifact in analysis-report.md conversion-plan.md reference-manifest.md source-fingerprint.txt source-files.json; do
  if [[ -f "$WORKSPACE_DIR/cache/$artifact" ]]; then
    echo "cache: $WORKSPACE_DIR/cache/$artifact"
  fi
done
