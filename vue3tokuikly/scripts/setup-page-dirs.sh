#!/usr/bin/env bash

set -euo pipefail

PAGE_NAME=""
OUTPUT_DIR=""
WORKSPACE_DIR=""
SOURCE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pageName) PAGE_NAME="${2:-}"; shift 2 ;;
    --outputDir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --workspaceDir) WORKSPACE_DIR="${2:-}"; shift 2 ;;
    --sourceDir) SOURCE_DIR="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$PAGE_NAME" ]] || { echo "--pageName is required" >&2; exit 1; }
OUTPUT_DIR="${OUTPUT_DIR:-.vue3tokuikly-output/$PAGE_NAME}"
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"
CACHE_DIR="$WORKSPACE_DIR/cache"
PROGRESS_FILE="$CACHE_DIR/progress.md"

mkdir -p "$CACHE_DIR" "$OUTPUT_DIR"

if [[ ! -f "$PROGRESS_FILE" ]]; then
  TIMESTAMP="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  cat > "$PROGRESS_FILE" <<EOF
# Vue3 to Kuikly progress

**Page**: $PAGE_NAME
**Source**: ${SOURCE_DIR:-not-set}
**Output**: $OUTPUT_DIR
**Current status**: initialized
**Last updated**: $TIMESTAMP

## Steps

<!-- step:discover -->
- [ ] discover: read source and target conventions
<!-- step:analyze -->
- [ ] analyze: dependency graph and semantic ledger
<!-- step:migrate -->
- [ ] migrate: dependency-ordered file conversion
<!-- step:verify -->
- [ ] verify: bidirectional audit and compile/run checks

## Converted files

| Source | Output | Compile | Updated |
| --- | --- | --- | --- |

## Event log

| Step | Status | Detail | Updated |
| --- | --- | --- | --- |

## Next action

Read source and target project conventions, then run analyze-file-structure.sh.
EOF
fi

echo "Workspace: $WORKSPACE_DIR"
echo "Output: $OUTPUT_DIR"
echo "Progress: $PROGRESS_FILE"
