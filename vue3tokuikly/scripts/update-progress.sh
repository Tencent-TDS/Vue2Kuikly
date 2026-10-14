#!/usr/bin/env bash

set -euo pipefail

PAGE_NAME=""
WORKSPACE_DIR=""
STEP=""
STATUS=""
NEXT_ACTION=""
FILE_INFO=""
COMPILE_STATUS="not_run"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pageName) PAGE_NAME="${2:-}"; shift 2 ;;
    --workspaceDir) WORKSPACE_DIR="${2:-}"; shift 2 ;;
    --step) STEP="${2:-}"; shift 2 ;;
    --status) STATUS="${2:-}"; shift 2 ;;
    --nextAction) NEXT_ACTION="${2:-}"; shift 2 ;;
    --fileInfo) FILE_INFO="${2:-}"; shift 2 ;;
    --compileStatus) COMPILE_STATUS="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$PAGE_NAME" && -n "$STEP" && -n "$STATUS" ]] || {
  echo "--pageName, --step and --status are required" >&2
  exit 1
}
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"
PROGRESS_FILE="$WORKSPACE_DIR/cache/progress.md"
[[ -f "$PROGRESS_FILE" ]] || { echo "Progress file not found: $PROGRESS_FILE" >&2; exit 1; }

case "$STATUS" in
  completed|in_progress|failed|file_done) ;;
  *) echo "Unsupported status: $STATUS" >&2; exit 1 ;;
esac
case "$COMPILE_STATUS" in
  passed|failed|not_run) ;;
  *) echo "Unsupported compile status: $COMPILE_STATUS" >&2; exit 1 ;;
esac

TIMESTAMP="$(date '+%Y-%m-%dT%H:%M:%S%z')"
TMP_FILE="${PROGRESS_FILE}.tmp"
trap 'rm -f "$TMP_FILE"' EXIT

CURRENT_STATUS="$STATUS"
[[ "$STATUS" == "file_done" ]] && CURRENT_STATUS="migrating files"
awk -v status="$CURRENT_STATUS" -v timestamp="$TIMESTAMP" '
  /^\*\*Current status\*\*:/ { print "**Current status**: " status "  "; next }
  /^\*\*Last updated\*\*:/ { print "**Last updated**: " timestamp; next }
  { print }
' "$PROGRESS_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$PROGRESS_FILE"

if [[ "$STATUS" == "completed" || "$STATUS" == "in_progress" || "$STATUS" == "failed" ]]; then
  CHECK=" "
  [[ "$STATUS" == "completed" ]] && CHECK="x"
  awk -v marker="<!-- step:$STEP -->" -v check="$CHECK" -v status="$STATUS" '
    $0 == marker { print; update = 1; next }
    update && /^- \[[ x]\]/ {
      sub(/^- \[[ x]\]/, "- [" check "]")
      if (status == "in_progress") sub(/$/, " (in progress)")
      if (status == "failed") sub(/$/, " (failed)")
      print
      update = 0
      found = 1
      next
    }
    { print }
    END {
      if (!found) {
        print ""
        print "<!-- step:" substr(marker, 11, length(marker) - 13) " -->"
        print "- [" check "] " substr(marker, 11, length(marker) - 13) ": " status
      }
    }
  ' "$PROGRESS_FILE" > "$TMP_FILE"
  mv "$TMP_FILE" "$PROGRESS_FILE"
fi

DETAIL="${FILE_INFO:-${NEXT_ACTION:-none}}"
SAFE_DETAIL="${DETAIL//|/\\|}"
awk -v step="$STEP" -v status="$STATUS" -v detail="$SAFE_DETAIL" -v timestamp="$TIMESTAMP" '
  /^## Event log/ { inEvent = 1; print; next }
  inEvent && /^$/ {
    if (!sectionBlank) {
      print
      sectionBlank = 1
    }
    next
  }
  /^## Next action/ && !inserted {
    print "| " step " | " status " | " detail " | " timestamp " |"
    print ""
    inserted = 1
    inEvent = 0
  }
  { print }
' "$PROGRESS_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$PROGRESS_FILE"

if [[ "$STATUS" == "file_done" ]]; then
  [[ "$FILE_INFO" == *" -> "* ]] || { echo "--fileInfo must use: source -> output" >&2; exit 1; }
  SOURCE_FILE="${FILE_INFO%% -> *}"
  OUTPUT_FILE="${FILE_INFO#* -> }"
  SAFE_SOURCE="${SOURCE_FILE//|/\\|}"
  SAFE_OUTPUT="${OUTPUT_FILE//|/\\|}"
  awk -F'|' -v source="$SAFE_SOURCE" -v output="$SAFE_OUTPUT" -v compile="$COMPILE_STATUS" -v timestamp="$TIMESTAMP" '
    function trim(value) { gsub(/^[ \t]+|[ \t]+$/, "", value); return value }
    /^## Converted files/ { inConverted = 1; print; next }
    inConverted && /^$/ {
      if (!sectionBlank) {
        print
        sectionBlank = 1
      }
      next
    }
    inConverted && /^\|/ && trim($2) == source && trim($3) == output {
      next
    }
    /^## Event log/ && inConverted {
      print "| " source " | " output " | " compile " | " timestamp " |"
      print ""
      inConverted = 0
    }
    { print }
  ' "$PROGRESS_FILE" > "$TMP_FILE"
  mv "$TMP_FILE" "$PROGRESS_FILE"
fi

if [[ -n "$NEXT_ACTION" ]]; then
  awk -v action="$NEXT_ACTION" '
    /^## Next action/ { print; print ""; print action; replace = 1; next }
    replace && /^## / { replace = 0 }
    !replace { print }
  ' "$PROGRESS_FILE" > "$TMP_FILE"
  mv "$TMP_FILE" "$PROGRESS_FILE"
fi

echo "Updated: $PROGRESS_FILE"
