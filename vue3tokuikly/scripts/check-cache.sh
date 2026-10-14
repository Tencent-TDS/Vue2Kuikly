#!/usr/bin/env bash

set -euo pipefail

PAGE_NAME=""
WORKSPACE_DIR=""
USE_CACHE="auto"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pageName) PAGE_NAME="${2:-}"; shift 2 ;;
    --workspaceDir) WORKSPACE_DIR="${2:-}"; shift 2 ;;
    --use-cache) USE_CACHE="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$PAGE_NAME" ]] || { echo "--pageName is required" >&2; exit 1; }
case "$USE_CACHE" in auto|yes|no) ;; *) echo "--use-cache must be auto, yes or no" >&2; exit 1 ;; esac
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"
CACHE_DIR="$WORKSPACE_DIR/cache"

if [[ "$USE_CACHE" == "no" ]]; then
  echo "Cache bypassed by caller."
  exit 1
fi

MISSING=0
for artifact in analysis-report.md conversion-plan.md reference-manifest.md source-fingerprint.txt source-files.json; do
  if [[ ! -s "$CACHE_DIR/$artifact" ]]; then
    echo "Missing: $CACHE_DIR/$artifact"
    MISSING=1
  fi
done

if [[ "$MISSING" -eq 0 ]]; then
  set +e
  node - "$CACHE_DIR/source-files.json" <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const extensions = new Set([
    '.vue', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.html',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.apng', '.ico', '.avif', '.heic', '.heif',
    '.ttf', '.otf', '.woff', '.woff2',
    '.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.mp4', '.webm', '.mov', '.m4v',
    '.json', '.lottie', '.pag', '.pdf', '.wasm', '.bin',
]);
const excluded = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

function walk(input) {
    if (!fs.existsSync(input)) return [];
    const stat = fs.statSync(input);
    if (stat.isFile()) return extensions.has(path.extname(input).toLowerCase()) ? [path.resolve(input)] : [];
    return fs.readdirSync(input, { withFileTypes: true }).flatMap(entry => {
        if (entry.isDirectory() && excluded.has(entry.name)) return [];
        const fullPath = path.join(input, entry.name);
        return entry.isDirectory() ? walk(fullPath) : (extensions.has(path.extname(entry.name).toLowerCase()) ? [path.resolve(fullPath)] : []);
    });
}

const expected = new Map(manifest.files.map(item => [path.resolve(item.path), item.sha256]));
let stale = false;
for (const [file, expectedHash] of expected) {
    if (!fs.existsSync(file)) {
        console.error(`Cache stale: source file removed: ${file}`);
        stale = true;
        continue;
    }
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (actualHash !== expectedHash) {
        console.error(`Cache stale: source file changed: ${file}`);
        stale = true;
    }
}

const initialFiles = new Set(walk(manifest.sourceInput));
const expectedInitialFiles = new Set([...expected.keys()].filter(file => {
    const relative = path.relative(manifest.sourceRoot, file);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}));
for (const file of initialFiles) {
    if (!expectedInitialFiles.has(file)) {
        console.error(`Cache stale: source file added: ${file}`);
        stale = true;
    }
}
process.exit(stale ? 3 : 0);
NODE
  FINGERPRINT_STATUS=$?
  set -e
  if [[ "$FINGERPRINT_STATUS" -ne 0 ]]; then
    MISSING=1
  fi
fi

if [[ "$MISSING" -eq 0 ]]; then
  echo "Reusable analysis cache found: $CACHE_DIR"
  exit 0
fi

if [[ "$USE_CACHE" == "yes" ]]; then
  echo "Requested cache is incomplete." >&2
  exit 1
fi

echo "No complete cache; rerun analysis."
exit 2
