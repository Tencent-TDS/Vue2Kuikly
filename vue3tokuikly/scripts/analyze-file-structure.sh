#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PAGE_NAME=""
SOURCE_DIR=""
OUTPUT_DIR=""
WORKSPACE_DIR=""
ALIAS_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pageName) PAGE_NAME="${2:-}"; shift 2 ;;
    --sourceDir) SOURCE_DIR="${2:-}"; shift 2 ;;
    --outputDir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --workspaceDir) WORKSPACE_DIR="${2:-}"; shift 2 ;;
    --aliasDir) ALIAS_DIR="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$PAGE_NAME" ]] || { echo "--pageName is required" >&2; exit 1; }
[[ -n "$SOURCE_DIR" ]] || { echo "--sourceDir is required" >&2; exit 1; }
OUTPUT_DIR="${OUTPUT_DIR:-.vue3tokuikly-output/$PAGE_NAME}"
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"

command -v node >/dev/null 2>&1 || { echo "Node.js is required" >&2; exit 1; }

ARGS=(
  --pageName "$PAGE_NAME"
  --sourceDir "$SOURCE_DIR"
  --outputDir "$OUTPUT_DIR"
  --workspaceDir "$WORKSPACE_DIR"
)
if [[ -n "$ALIAS_DIR" ]]; then
  ARGS+=(--aliasDir "$ALIAS_DIR")
fi

exec node "$SCRIPT_DIR/analyze-vue-project.js" "${ARGS[@]}"
