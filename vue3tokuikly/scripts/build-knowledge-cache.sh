#!/usr/bin/env bash

# Compatibility entry point. It now builds a reference manifest instead of
# concatenating full documents, preserving progressive disclosure.

set -euo pipefail

PAGE_NAME=""
WORKSPACE_DIR=""
BUSINESS_SKILL=""
KEYWORDS_FILE=""
BIZ_KEYWORDS_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pageName) PAGE_NAME="${2:-}"; shift 2 ;;
    --workspaceDir) WORKSPACE_DIR="${2:-}"; shift 2 ;;
    --businessSkill) BUSINESS_SKILL="${2:-}"; shift 2 ;;
    --keywordsFile) KEYWORDS_FILE="${2:-}"; shift 2 ;;
    --compKeywords) shift 2 ;;
    --bizKeywords) BIZ_KEYWORDS_ARG="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$PAGE_NAME" ]] || { echo "--pageName is required" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"
CACHE_DIR="$WORKSPACE_DIR/cache"
OUTPUT_FILE="$CACHE_DIR/reference-manifest.md"
mkdir -p "$CACHE_DIR"

BIZ_KEYWORDS="$BIZ_KEYWORDS_ARG"
if [[ -n "$KEYWORDS_FILE" ]]; then
  [[ -f "$KEYWORDS_FILE" ]] || { echo "Keywords file not found: $KEYWORDS_FILE" >&2; exit 1; }
  BIZ_KEYWORDS="$(awk -F= '/^BIZ_KEYWORDS=/{sub(/^[^=]*=/, ""); print; exit}' "$KEYWORDS_FILE")"
fi

REFERENCES=()
if [[ -f "$OUTPUT_FILE" ]]; then
  while IFS= read -r reference; do
    [[ -n "$reference" ]] && REFERENCES+=("$reference")
  done < <(sed -n 's/^- `\(.*\)`$/\1/p' "$OUTPUT_FILE")
fi
if [[ "${#REFERENCES[@]}" -eq 0 ]]; then
  REFERENCES=(
    "$SKILL_DIR/references/vue3-semantics-mapping.md"
    "$SKILL_DIR/references/vue-template-style-mapping.md"
    "$SKILL_DIR/references/kuikly-self-dsl-mapping.md"
    "$SKILL_DIR/references/generation-validation.md"
  )
fi

BUSINESS_DIR=""
if [[ -n "$BUSINESS_SKILL" ]]; then
  CANDIDATES=(
    "$BUSINESS_SKILL"
    "$SKILL_DIR/../$BUSINESS_SKILL"
    "${CODEX_HOME:-$HOME/.codex}/skills/$BUSINESS_SKILL"
    "$PWD/.codex/skills/$BUSINESS_SKILL"
  )
  for candidate in "${CANDIDATES[@]}"; do
    if [[ -d "$candidate" ]]; then
      BUSINESS_DIR="$(cd "$candidate" && pwd)"
      break
    fi
  done
fi

BUSINESS_STATUS="not requested"
EXIT_STATUS=0
if [[ -n "$BUSINESS_SKILL" && -z "$BUSINESS_DIR" ]]; then
  BUSINESS_STATUS="not found: $BUSINESS_SKILL"
  EXIT_STATUS=2
elif [[ -n "$BUSINESS_DIR" ]]; then
  BUSINESS_STATUS="applied from $BUSINESS_DIR"
  REFERENCES+=("$SKILL_DIR/references/business-skill-contract.md")
  BUSINESS_SKILL_MD="$BUSINESS_DIR/SKILL.md"
  if [[ ! -f "$BUSINESS_SKILL_MD" ]]; then
    BUSINESS_STATUS="SKILL.md missing in $BUSINESS_DIR"
    EXIT_STATUS=2
  else
    get_config() {
      local key="$1"
      sed -n '/<!-- PATH_CONFIG_START -->/,/<!-- PATH_CONFIG_END -->/p' "$BUSINESS_SKILL_MD" \
        | awk -F= -v key="$key" '{name=$1; gsub(/^[ \t]+|[ \t]+$/, "", name)} name == key {sub(/^[^=]*=/, ""); gsub(/^[ \t]+|[ \t\r]+$/, ""); print; exit}'
    }
    CONFIG_INCOMPLETE=0
    for key in EXAMPLE_CODE CHECKLIST BIZ_KEYWORDS_MAP BIZ_RULES_DIR BIZ_BASE_RULES; do
      value="$(get_config "$key")"
      if [[ -z "$value" ]]; then
        echo "Business PATH_CONFIG is missing $key" >&2
        CONFIG_INCOMPLETE=1
      elif [[ "$key" == "BIZ_RULES_DIR" ]]; then
        [[ -d "$BUSINESS_DIR/$value" ]] || { echo "Business path does not exist: $BUSINESS_DIR/$value" >&2; CONFIG_INCOMPLETE=1; }
      elif [[ -e "$BUSINESS_DIR/$value" ]]; then
        REFERENCES+=("$BUSINESS_DIR/$value")
      else
        echo "Business path does not exist: $BUSINESS_DIR/$value" >&2
        CONFIG_INCOMPLETE=1
      fi
    done
    BIZ_RULES_DIR="$(get_config BIZ_RULES_DIR)"
    if [[ -n "$BIZ_RULES_DIR" && -d "$BUSINESS_DIR/$BIZ_RULES_DIR" && -n "$BIZ_KEYWORDS" ]]; then
      IFS=',' read -r -a KEYWORD_ARRAY <<< "$BIZ_KEYWORDS"
      for keyword in "${KEYWORD_ARRAY[@]}"; do
        rule="$BUSINESS_DIR/$BIZ_RULES_DIR/$keyword.md"
        if [[ -f "$rule" ]]; then
          REFERENCES+=("$rule")
        else
          echo "No business rule for keyword: $keyword" >&2
          CONFIG_INCOMPLETE=1
        fi
      done
    fi
    if [[ "$CONFIG_INCOMPLETE" -ne 0 ]]; then
      BUSINESS_STATUS="incomplete PATH_CONFIG in $BUSINESS_DIR"
      EXIT_STATUS=2
    fi
  fi
fi

{
  echo "# Reference manifest"
  echo ""
  echo "**Business rules**: $BUSINESS_STATUS"
  echo ""
  echo "Read only the entries needed by the current source features. Do not concatenate them into model context."
  echo ""
  printf '%s\n' "${REFERENCES[@]}" | awk '!seen[$0]++ {print "- `" $0 "`"}'
} > "$OUTPUT_FILE"

echo "Reference manifest: $OUTPUT_FILE"
exit "$EXIT_STATUS"
