#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PROJECT_DIR="$TMP_DIR/vue"
SOURCE_DIR="$PROJECT_DIR/src"
WORKSPACE_DIR="$TMP_DIR/workspace"
OUTPUT_DIR="$TMP_DIR/kuikly"
mkdir -p "$SOURCE_DIR/views" "$SOURCE_DIR/components" "$SOURCE_DIR/model" "$SOURCE_DIR/assets" "$PROJECT_DIR/public"

cat > "$PROJECT_DIR/package.json" <<'EOF'
{"name":"resource-migration-fixture","private":true}
EOF
printf 'logo-bytes' > "$SOURCE_DIR/assets/logo.png"
printf 'card-bytes' > "$SOURCE_DIR/assets/card.png"
printf '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>' > "$SOURCE_DIR/assets/background.svg"
printf '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h2v2z"/></svg>' > "$SOURCE_DIR/assets/raw-only.svg"
printf 'font-bytes' > "$SOURCE_DIR/assets/demo.woff2"
printf 'unused-bytes' > "$SOURCE_DIR/assets/unused.png"
printf 'runtime-bytes' > "$SOURCE_DIR/assets/runtime.png"
printf 'splash-bytes' > "$PROJECT_DIR/public/splash.png"

cat > "$SOURCE_DIR/views/Home.vue" <<'EOF'
<template>
  <van-pull-refresh v-model="refreshing" @refresh="refresh">
    <img :src="logo" />
    <img :src="runtimeLogo" />
    <img src="/splash.png" />
    <img src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M0%200h1v1z%22%2F%3E%3C%2Fsvg%3E" />
    <van-icon v-if="active > '0'" name="vip-card-o" />
    <van-icon name="home-o" />
    <van-icon :name="active ? 'like' : 'like-o'" />
    <Card v-for="item in items" :key="item.id" :item="item" />
  </van-pull-refresh>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Card from '@/components/Card.vue'
import type { Item } from '@/model/Item'
import logo from '@/assets/logo.png'
import rawSvg from '@/assets/raw-only.svg?raw'

const refreshing = ref(false)
const active = ref(false)
const runtimeName = 'runtime'
const runtimeLogo = new URL(`../assets/${runtimeName}.png`, import.meta.url).href
const items = ref<Item[]>([])
const count = computed(() => items.value.length)
watch(count, () => { refreshing.value = false })
function refresh() { items.value = [] }
</script>

<style scoped>
@font-face { font-family: DemoFont; src: url('@/assets/demo.woff2'); }
.page { padding: 12px; background-image: url('@/assets/background.svg'); }
</style>
EOF

cat > "$SOURCE_DIR/components/Card.vue" <<'EOF'
<template><div><img src="../assets/card.png" />{{ item.title }}</div></template>
<script setup lang="ts">
import type { Item } from '@/model/Item'
defineProps<{ item: Item }>()
</script>
EOF

cat > "$SOURCE_DIR/model/Item.ts" <<'EOF'
export interface Item { id: string; title: string }
EOF

bash "$SCRIPT_DIR/setup-page-dirs.sh" \
  --pageName Home \
  --sourceDir "$SOURCE_DIR/views" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR"

bash "$SCRIPT_DIR/analyze-file-structure.sh" \
  --pageName Home \
  --sourceDir "$SOURCE_DIR/views" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR" \
  --aliasDir "$SOURCE_DIR"

grep -q 'Home.vue' "$WORKSPACE_DIR/cache/analysis-report.md"
grep -q 'external:.*Card.vue' "$WORKSPACE_DIR/cache/analysis-report.md"
grep -q 'vue3-semantics-mapping.md' "$WORKSPACE_DIR/cache/reference-manifest.md"
grep -q 'component-library-mapping.md' "$WORKSPACE_DIR/cache/reference-manifest.md"
grep -q 'resource-migration.md' "$WORKSPACE_DIR/cache/reference-manifest.md"
grep -q 'logo.png.*Physical resource' "$WORKSPACE_DIR/cache/analysis-report.md"

PLAIN_SOURCE="$TMP_DIR/plain/Plain.vue"
PLAIN_WORKSPACE="$TMP_DIR/plain-workspace"
mkdir -p "$(dirname "$PLAIN_SOURCE")"
cat > "$PLAIN_SOURCE" <<'EOF'
<template><div>plain</div></template>
<script setup>const title = 'plain'</script>
EOF
bash "$SCRIPT_DIR/analyze-file-structure.sh" \
  --pageName Plain --sourceDir "$PLAIN_SOURCE" --outputDir "$OUTPUT_DIR" --workspaceDir "$PLAIN_WORKSPACE"
if grep -q 'resource-migration.md' "$PLAIN_WORKSPACE/cache/reference-manifest.md"; then
  echo "resource reference was loaded for a source without resource features" >&2
  exit 1
fi
bash "$SCRIPT_DIR/check-cache.sh" --pageName Home --workspaceDir "$WORKSPACE_DIR" --use-cache auto
cp "$SOURCE_DIR/views/Home.vue" "$TMP_DIR/Home.vue.original"
echo "<!-- cache invalidation -->" >> "$SOURCE_DIR/views/Home.vue"
if bash "$SCRIPT_DIR/check-cache.sh" --pageName Home --workspaceDir "$WORKSPACE_DIR" --use-cache auto >/dev/null 2>&1; then
  echo "stale cache unexpectedly succeeded" >&2
  exit 1
else
  [[ "$?" -eq 2 ]]
fi
mv "$TMP_DIR/Home.vue.original" "$SOURCE_DIR/views/Home.vue"
bash "$SCRIPT_DIR/check-cache.sh" --pageName Home --workspaceDir "$WORKSPACE_DIR" --use-cache auto >/dev/null
cp "$SOURCE_DIR/assets/logo.png" "$TMP_DIR/logo.png.original"
printf 'changed-logo' > "$SOURCE_DIR/assets/logo.png"
if bash "$SCRIPT_DIR/check-cache.sh" --pageName Home --workspaceDir "$WORKSPACE_DIR" --use-cache auto >/dev/null 2>&1; then
  echo "changed resource unexpectedly reused cache" >&2
  exit 1
else
  [[ "$?" -eq 2 ]]
fi
mv "$TMP_DIR/logo.png.original" "$SOURCE_DIR/assets/logo.png"
bash "$SCRIPT_DIR/check-cache.sh" --pageName Home --workspaceDir "$WORKSPACE_DIR" --use-cache auto >/dev/null
if bash "$SCRIPT_DIR/check-cache.sh" --pageName Missing --workspaceDir "$TMP_DIR/missing" --use-cache auto >/dev/null 2>&1; then
  echo "missing cache unexpectedly succeeded" >&2
  exit 1
else
  [[ "$?" -eq 2 ]]
fi

bash "$SCRIPT_DIR/update-progress.sh" \
  --pageName Home --workspaceDir "$WORKSPACE_DIR" \
  --step discover --status completed --nextAction "Review analysis"
bash "$SCRIPT_DIR/update-progress.sh" \
  --pageName Home --workspaceDir "$WORKSPACE_DIR" \
  --step migrate --status file_done \
  --fileInfo "views/Home.vue -> HomePage.kt" --compileStatus passed
bash "$SCRIPT_DIR/update-progress.sh" \
  --pageName Home --workspaceDir "$WORKSPACE_DIR" \
  --step migrate --status file_done \
  --fileInfo "views/Home.vue -> HomePage.kt" --compileStatus passed

[[ "$(grep -c '^| views/Home.vue | HomePage.kt | passed |' "$WORKSPACE_DIR/cache/progress.md")" -eq 1 ]]
grep -q '^- \[x\] discover:' "$WORKSPACE_DIR/cache/progress.md"

bash "$SCRIPT_DIR/build-knowledge-cache.sh" --pageName Home --workspaceDir "$WORKSPACE_DIR"
grep -q 'Business rules.*not requested' "$WORKSPACE_DIR/cache/reference-manifest.md"
if bash "$SCRIPT_DIR/build-knowledge-cache.sh" \
  --pageName Home --workspaceDir "$WORKSPACE_DIR" \
  --businessSkill "$TMP_DIR/does-not-exist" >/dev/null 2>&1; then
  echo "missing business skill unexpectedly succeeded" >&2
  exit 1
else
  [[ "$?" -eq 2 ]]
fi

BUSINESS_DIR="$TMP_DIR/business-skill"
mkdir -p "$BUSINESS_DIR/references/rules"
cat > "$BUSINESS_DIR/SKILL.md" <<'EOF'
---
name: test-business
description: Test fixture.
---
<!-- PATH_CONFIG_START -->
EXAMPLE_CODE=references/example.md
CHECKLIST=references/checklist.md
BIZ_KEYWORDS_MAP=references/keywords.md
BIZ_RULES_DIR=references/rules
BIZ_BASE_RULES=references/rules/base.md
<!-- PATH_CONFIG_END -->
EOF
for file in example.md checklist.md keywords.md; do
  echo "fixture" > "$BUSINESS_DIR/references/$file"
done
echo "base" > "$BUSINESS_DIR/references/rules/base.md"
echo "storage" > "$BUSINESS_DIR/references/rules/storage.md"
bash "$SCRIPT_DIR/build-knowledge-cache.sh" \
  --pageName Home --workspaceDir "$WORKSPACE_DIR" \
  --businessSkill "$BUSINESS_DIR" --bizKeywords storage
grep -q 'rules/storage.md' "$WORKSPACE_DIR/cache/reference-manifest.md"

TARGET_ASSETS_DIR="$TMP_DIR/kuikly-module/src/commonMain/assets"
KOTLIN_DIR="$TMP_DIR/kuikly-module/src/commonMain/kotlin/com/example/home"
node "$SCRIPT_DIR/migrate-resources.js" \
  --mode plan --pageName Home --sourceDir "$SOURCE_DIR/views" \
  --outputDir "$KOTLIN_DIR" --workspaceDir "$WORKSPACE_DIR" \
  --projectRoot "$PROJECT_DIR" --aliasDir "$SOURCE_DIR" \
  --targetAssetsDir "$TARGET_ASSETS_DIR" --assetScope page
grep -q 'components/Card.vue' "$WORKSPACE_DIR/cache/resource-manifest.md"
grep -q 'symbolic.*vip-card-o' "$WORKSPACE_DIR/cache/resource-manifest.md"
grep -q 'symbolic.*home-o' "$WORKSPACE_DIR/cache/resource-manifest.md"
grep -q "symbolic.*active ? 'like' : 'like-o'" "$WORKSPACE_DIR/cache/resource-manifest.md"
grep -q 'dynamic-template.*runtimeName' "$WORKSPACE_DIR/cache/resource-manifest.md"
grep -q 'raw-resource.*raw-only.svg' "$WORKSPACE_DIR/cache/resource-manifest.md"
if grep -q 'unreferenced.*raw-only.svg' "$WORKSPACE_DIR/cache/resource-manifest.md"; then
  echo "Vite raw resource was incorrectly inventoried as unreferenced" >&2
  exit 1
fi
grep -q 'unreferenced.*unused.png' "$WORKSPACE_DIR/cache/resource-manifest.md"

node - "$WORKSPACE_DIR/cache/resource-manifest.json" "$WORKSPACE_DIR/cache/resource-mappings.json" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const runtime = manifest.records.find(record => record.kind === 'unreferenced' && record.rawReference.endsWith('runtime.png'));
if (!runtime) throw new Error('runtime inventory record not found');
const mappings = {
    [runtime.id]: {
        resolution: 'runtime',
        copy: true,
        evidence: `resource_${runtime.id}`,
        note: 'The dynamic URL domain includes this fixture asset.',
    },
};
fs.writeFileSync(process.argv[3], `${JSON.stringify({ version: 1, mappings }, null, 2)}\n`);
NODE

node "$SCRIPT_DIR/migrate-resources.js" \
  --mode apply --pageName Home --sourceDir "$SOURCE_DIR/views" \
  --outputDir "$KOTLIN_DIR" --workspaceDir "$WORKSPACE_DIR" \
  --projectRoot "$PROJECT_DIR" --aliasDir "$SOURCE_DIR" \
  --targetAssetsDir "$TARGET_ASSETS_DIR" --assetScope page
cmp "$SOURCE_DIR/assets/logo.png" "$TARGET_ASSETS_DIR/Home/assets/logo.png"
cmp "$SOURCE_DIR/assets/card.png" "$TARGET_ASSETS_DIR/Home/assets/card.png"
cmp "$SOURCE_DIR/assets/runtime.png" "$TARGET_ASSETS_DIR/Home/assets/runtime.png"
cmp "$PROJECT_DIR/public/splash.png" "$TARGET_ASSETS_DIR/Home/splash.png"
find "$TARGET_ASSETS_DIR/Home/inline" -type f -name 'inline_*.svg' | grep -q .
[[ ! -e "$TARGET_ASSETS_DIR/Home/assets/unused.png" ]]

cp "$TARGET_ASSETS_DIR/Home/assets/logo.png" "$TMP_DIR/target-logo.original"
printf 'target-collision' > "$TARGET_ASSETS_DIR/Home/assets/logo.png"
if node "$SCRIPT_DIR/migrate-resources.js" \
  --mode apply --pageName Home --sourceDir "$SOURCE_DIR/views" \
  --outputDir "$KOTLIN_DIR" --workspaceDir "$WORKSPACE_DIR" \
  --projectRoot "$PROJECT_DIR" --aliasDir "$SOURCE_DIR" \
  --targetAssetsDir "$TARGET_ASSETS_DIR" --assetScope page >/dev/null 2>&1; then
  echo "resource collision unexpectedly overwrote target" >&2
  exit 1
fi
mv "$TMP_DIR/target-logo.original" "$TARGET_ASSETS_DIR/Home/assets/logo.png"

MISSING_SOURCE="$TMP_DIR/missing-resource-source"
MISSING_WORKSPACE="$TMP_DIR/missing-resource-workspace"
MISSING_TARGET="$TMP_DIR/missing-resource-target"
mkdir -p "$MISSING_SOURCE"
cat > "$MISSING_SOURCE/Missing.vue" <<'EOF'
<template><img src="./missing.png" /><img src="./present.png" /></template>
EOF
printf 'present' > "$MISSING_SOURCE/present.png"
if node "$SCRIPT_DIR/migrate-resources.js" \
  --mode apply --pageName Missing --sourceDir "$MISSING_SOURCE" \
  --workspaceDir "$MISSING_WORKSPACE" --targetAssetsDir "$MISSING_TARGET" >/dev/null 2>&1; then
  echo "unresolved resource apply unexpectedly succeeded" >&2
  exit 1
else
  [[ "$?" -eq 2 ]]
fi
[[ ! -d "$MISSING_TARGET/Missing" ]]

mkdir -p "$KOTLIN_DIR"
node - "$WORKSPACE_DIR/cache/resource-manifest.json" "$WORKSPACE_DIR/cache/resource-mappings.json" "$KOTLIN_DIR/HomePage.kt" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mappings = {};
const evidence = [];
for (const record of manifest.records) {
    if (record.kind === 'unreferenced') {
        if (record.copyRequested) {
            const token = `resource_${record.id}`;
            mappings[record.id] = {
                resolution: 'runtime', copy: true, evidence: token,
                note: 'The dynamic URL domain includes this fixture asset.',
            };
            evidence.push(token);
        } else {
            mappings[record.id] = { resolution: 'not-used', note: 'Fixture proves this file has no source or runtime lookup.' };
        }
        continue;
    }
    const needsMapping = record.requiresMapping || record.status === 'needs-mapping' || ['raw-resource', 'local-missing'].includes(record.kind);
    if (needsMapping) {
        const token = `resource_${record.id}`;
        mappings[record.id] = {
            resolution: record.category === 'font' ? 'host-registered' : 'converted',
            evidence: token,
            note: 'Fixture supplies explicit target evidence.',
        };
        evidence.push(token);
    } else if (['local', 'inline-data', 'inline-svg-static'].includes(record.kind)) {
        evidence.push(record.kotlinExpression || record.uriPath);
    } else if (record.kind === 'remote') {
        evidence.push(record.rawReference);
    }
}
fs.writeFileSync(process.argv[3], `${JSON.stringify({ version: 1, mappings }, null, 2)}\n`);
fs.writeFileSync(process.argv[4], evidence.map(token => `// ${token}`).join('\n') + '\n');
NODE
if ! node "$SCRIPT_DIR/migrate-resources.js" \
  --mode validate --pageName Home --workspaceDir "$WORKSPACE_DIR" --kotlinDir "$KOTLIN_DIR"; then
  cat "$WORKSPACE_DIR/cache/resource-validation.md" >&2
  exit 1
fi
grep -q -- '- passed' "$WORKSPACE_DIR/cache/resource-validation.md"

ASSET_SOURCE="$TMP_DIR/assets-source"
ASSET_OUTPUT="$TMP_DIR/assets-output"
mkdir -p "$ASSET_SOURCE"
cat > "$ASSET_SOURCE/Icon.vue" <<'EOF'
<template>
  <img src="data:image/png;base64,iVBORw0KGgo=" />
  <svg viewBox="0 0 1 1"><path :fill="color" d="M0 0h1v1z" /></svg>
</template>
EOF
SOURCE_HASH_BEFORE="$(shasum -a 256 "$ASSET_SOURCE/Icon.vue" | awk '{print $1}')"
node "$SCRIPT_DIR/extract-inline-assets.js" --sourceDir "$ASSET_SOURCE" --outputDir "$ASSET_OUTPUT"
node "$SCRIPT_DIR/extract-inline-assets.js" --sourceDir "$ASSET_SOURCE" --outputDir "$ASSET_OUTPUT"
if node "$SCRIPT_DIR/extract-inline-assets.js" \
  --sourceDir "$ASSET_SOURCE" --outputDir "$ASSET_SOURCE/generated" >/dev/null 2>&1; then
  echo "nested asset output unexpectedly succeeded" >&2
  exit 1
fi
SOURCE_HASH_AFTER="$(shasum -a 256 "$ASSET_SOURCE/Icon.vue" | awk '{print $1}')"
[[ "$SOURCE_HASH_BEFORE" == "$SOURCE_HASH_AFTER" ]]
grep -q 'Inline SVG blocks left unchanged.*1' "$ASSET_OUTPUT/asset-manifest.md"
find "$ASSET_OUTPUT/assets" -type f -name 'inline_*.png' | grep -q .

bash -n "$SCRIPT_DIR"/*.sh
node --check "$SCRIPT_DIR/analyze-vue-project.js"
node --check "$SCRIPT_DIR/extract-inline-assets.js"
node --check "$SCRIPT_DIR/migrate-resources.js"

echo "vue3tokuikly script tests passed"
