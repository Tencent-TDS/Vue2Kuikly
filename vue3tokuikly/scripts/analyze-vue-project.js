#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TEXT_EXTENSIONS = new Set(['.vue', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.html']);
const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.less']);
const RESOURCE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.apng', '.ico', '.avif', '.heic', '.heif',
    '.ttf', '.otf', '.woff', '.woff2',
    '.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.mp4', '.webm', '.mov', '.m4v',
    '.json', '.lottie', '.pag', '.pdf', '.wasm', '.bin',
]);
const SOURCE_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...RESOURCE_EXTENSIONS]);
const RESOLVE_EXTENSIONS = ['', '.vue', '.ts', '.tsx', '.js', '.jsx', ...RESOURCE_EXTENSIONS];
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (!key.startsWith('--')) fail(`unknown argument: ${key}`);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) fail(`missing value for ${key}`);
        args[key.slice(2)] = value;
        index += 1;
    }
    for (const required of ['pageName', 'sourceDir', 'outputDir', 'workspaceDir']) {
        if (!args[required]) fail(`--${required} is required`);
    }
    return args;
}

function walk(inputPath) {
    const stat = fs.statSync(inputPath);
    if (stat.isFile()) return SOURCE_EXTENSIONS.has(path.extname(inputPath).toLowerCase()) ? [path.resolve(inputPath)] : [];
    const files = [];
    for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(inputPath, entry.name);
        if (entry.isDirectory()) files.push(...walk(fullPath));
        else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(path.resolve(fullPath));
    }
    return files;
}

function importSpecifiers(content) {
    const found = new Set();
    const staticImport = /(?:import|export)\s+(?:type\s+)?(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g;
    const dynamicImport = /(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
    for (const pattern of [staticImport, dynamicImport]) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) found.add(match[1]);
    }
    return [...found];
}

function resolveLocal(specifier, fromFile, aliasDir) {
    const cleanSpecifier = specifier.replace(/[?#].*$/, '');
    let basePath;
    if (cleanSpecifier.startsWith('./') || cleanSpecifier.startsWith('../')) {
        basePath = path.resolve(path.dirname(fromFile), cleanSpecifier);
    } else if (cleanSpecifier.startsWith('@/') && aliasDir) {
        basePath = path.resolve(aliasDir, cleanSpecifier.slice(2));
    } else {
        return null;
    }

    for (const extension of RESOLVE_EXTENSIONS) {
        const candidate = `${basePath}${extension}`;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
    }
    for (const extension of RESOLVE_EXTENSIONS.slice(1)) {
        const candidate = path.join(basePath, `index${extension}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
    }
    return null;
}

function projectRelative(file, sourceRoot) {
    const relative = path.relative(sourceRoot, file);
    return relative.startsWith('..') ? `external:${file}` : relative || path.basename(file);
}

function featureFlags(allContent, resourceCount) {
    const rules = {
        scriptSetup: /<script\s+setup\b/,
        compositionApi: /\b(ref|reactive|computed|watch|watchEffect|onMounted|onUnmounted)\s*\(/,
        macros: /\b(defineProps|defineEmits|defineExpose|defineModel|withDefaults)\s*(?:<|\()/,
        template: /<template\b|\bv-(if|for|model|show|html)\b|@[\w:-]+=/,
        componentLibrary: /\b(vant|element-plus|naive-ui|ant-design-vue)\b|<van-|<el-|<n-/,
        integration: /\b(vue-router|pinia|axios|fetch\s*\(|localStorage|sessionStorage|window\.|document\.|setTimeout|setInterval)\b/,
        inlineAssets: /data:image\/|<svg\b/,
        resources: /(?:src|href|poster|srcset)\s*=|\burl\s*\(|new\s+URL\s*\(|<van-(?:icon|tabbar-item)\b|\bicon\s*:|\.(?:png|jpe?g|gif|webp|svg|avif|heic|heif|ttf|otf|woff2?|mp[34]|mov|m4v|ogg|flac|json|lottie|pag|pdf|wasm)(?:[?#][^"'`\s)]*)?["'`)]/i,
        teleport: /<Teleport\b|<teleport\b/,
        slots: /<slot\b|useSlots\s*\(/,
    };
    const flags = Object.fromEntries(Object.entries(rules).map(([name, pattern]) => [name, pattern.test(allContent)]));
    flags.resources = flags.resources || resourceCount > 0;
    return flags;
}

function candidateKind(file, content) {
    const extension = path.extname(file).toLowerCase();
    if (RESOURCE_EXTENSIONS.has(extension)) return 'Physical resource; usage and target API require confirmation';
    if (extension === '.vue') {
        if (/defineProps|defineEmits|<slot\b/.test(content)) {
            return /\b(ref|reactive|watch|computed)\s*\(/.test(content)
                ? 'Stateful Vue component candidate'
                : 'Vue component candidate';
        }
        return 'Vue SFC; page/component role requires source confirmation';
    }
    if (STYLE_EXTENSIONS.has(extension)) return 'Style input; migrate with owning component';
    if (extension === '.html') return 'HTML/template input; migrate with owning page or component';
    if (/\b(createRouter|createWebHistory|RouteRecordRaw)\b/.test(content)) return 'Router integration candidate';
    if (/\bcreateApp\s*\(|\.mount\s*\(/.test(content)) return 'Application bootstrap candidate';
    if (/\b(defineStore|createPinia)\s*\(/.test(content)) return 'Shared state integration candidate';
    if (/\b(interface|type|enum)\b/.test(content) && !/\b(fetch|axios|ref|reactive)\b/.test(content)) return 'Type/model candidate';
    return 'Script/tool/integration candidate';
}

function candidateTier(file, content) {
    const kind = candidateKind(file, content);
    if (kind.includes('bootstrap') || kind.includes('Router integration')) return 4;
    if (path.extname(file) !== '.vue') return 0;
    if (kind === 'Vue component candidate') return 1;
    if (kind === 'Stateful Vue component candidate') return 2;
    return 3;
}

function topologicalOrder(nodes, dependencyMap, contents) {
    const visiting = new Set();
    const visited = new Set();
    const cycles = [];

    function visit(node, stack) {
        if (visited.has(node)) return;
        if (visiting.has(node)) {
            const start = stack.indexOf(node);
            cycles.push([...stack.slice(start), node]);
            return;
        }
        visiting.add(node);
        for (const dependency of dependencyMap.get(node) || []) {
            if (nodes.has(dependency)) visit(dependency, [...stack, node]);
        }
        visiting.delete(node);
        visited.add(node);
    }

    [...nodes].sort().forEach(node => visit(node, []));
    const indegree = new Map();
    const dependents = new Map();
    for (const node of nodes) {
        const dependencies = (dependencyMap.get(node) || []).filter(value => nodes.has(value));
        indegree.set(node, dependencies.length);
        for (const dependency of dependencies) {
            if (!dependents.has(dependency)) dependents.set(dependency, []);
            dependents.get(dependency).push(node);
        }
    }
    const compare = (left, right) => {
        const leftTier = candidateTier(left, contents.get(left) || '');
        const rightTier = candidateTier(right, contents.get(right) || '');
        return leftTier - rightTier || left.localeCompare(right);
    };
    const ready = [...nodes].filter(node => indegree.get(node) === 0).sort(compare);
    const order = [];
    while (ready.length > 0) {
        const node = ready.shift();
        order.push(node);
        for (const dependent of dependents.get(node) || []) {
            indegree.set(dependent, indegree.get(dependent) - 1);
            if (indegree.get(dependent) === 0) {
                ready.push(dependent);
                ready.sort(compare);
            }
        }
    }
    const unresolvedCycleNodes = [...nodes].filter(node => !order.includes(node)).sort(compare);
    order.push(...unresolvedCycleNodes);
    return { order, cycles };
}

function write(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${content.trim()}\n`);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const sourceInput = path.resolve(args.sourceDir);
    if (!fs.existsSync(sourceInput)) fail(`source path does not exist: ${sourceInput}`);
    const sourceRoot = fs.statSync(sourceInput).isDirectory() ? sourceInput : path.dirname(sourceInput);
    const aliasDir = args.aliasDir ? path.resolve(args.aliasDir) : null;
    if (aliasDir && !fs.existsSync(aliasDir)) fail(`alias directory does not exist: ${aliasDir}`);

    const initialFiles = walk(sourceInput);
    if (initialFiles.length === 0) fail(`no supported Vue/JS/TS/style/resource files found in ${sourceInput}`);

    const files = new Set(initialFiles);
    const queue = initialFiles.filter(file => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
    const dependencyMap = new Map();
    const unresolved = [];
    const packages = new Set();
    const contents = new Map();

    while (queue.length > 0) {
        const file = queue.shift();
        if (!fs.existsSync(file)) continue;
        const content = fs.readFileSync(file, 'utf8');
        contents.set(file, content);
        const dependencies = [];
        for (const specifier of importSpecifiers(content)) {
            const resolved = resolveLocal(specifier, file, aliasDir);
            if (resolved) {
                dependencies.push(resolved);
                if (!files.has(resolved) && !resolved.includes(`${path.sep}node_modules${path.sep}`)) {
                    files.add(resolved);
                    if (TEXT_EXTENSIONS.has(path.extname(resolved).toLowerCase())) queue.push(resolved);
                }
            } else if (specifier.startsWith('.') || specifier.startsWith('@/')) {
                unresolved.push({ file, specifier });
            } else {
                packages.add(specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'));
            }
        }
        dependencyMap.set(file, dependencies);
    }

    const codeFiles = new Set([...files].filter(file => {
        const extension = path.extname(file).toLowerCase();
        return TEXT_EXTENSIONS.has(extension) && !STYLE_EXTENSIONS.has(extension);
    }));
    const { order, cycles } = topologicalOrder(codeFiles, dependencyMap, contents);
    const allContent = [...contents.values()].join('\n');
    const resourceFiles = [...files].filter(file => RESOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
    const features = featureFlags(allContent, resourceFiles.length);
    const fingerprint = crypto.createHash('sha256');
    [...files].sort().forEach(file => {
        fingerprint.update(projectRelative(file, sourceRoot));
        fingerprint.update('\0');
        fingerprint.update(contents.get(file) || fs.readFileSync(file));
        fingerprint.update('\0');
    });
    const sourceFingerprint = fingerprint.digest('hex');
    const cacheDir = path.resolve(args.workspaceDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    const inventoryRows = [...files].sort().map(file => {
        const content = contents.get(file);
        const external = path.relative(sourceRoot, file).startsWith('..') ? 'yes' : 'no';
        const size = content === undefined
            ? `${fs.statSync(file).size} bytes`
            : `${content.split(/\r?\n/).length} lines`;
        return `| \`${projectRelative(file, sourceRoot)}\` | ${candidateKind(file, content || '')} | ${external} | ${size} |`;
    });
    const dependencyRows = [...codeFiles].sort().flatMap(file => {
        const dependencies = (dependencyMap.get(file) || []).filter(dep => files.has(dep));
        if (dependencies.length === 0) return [`- \`${projectRelative(file, sourceRoot)}\` -> none`];
        return dependencies.map(dep => `- \`${projectRelative(file, sourceRoot)}\` -> \`${projectRelative(dep, sourceRoot)}\``);
    });
    const featureRows = Object.entries(features).map(([name, enabled]) => `| ${name} | ${enabled ? 'yes' : 'no'} |`);

    const report = `# Vue3 source analysis

**Page**: ${args.pageName}  
**Source**: ${sourceInput}  
**Output**: ${path.resolve(args.outputDir)}  
**Source fingerprint**: \`${sourceFingerprint}\`

## Feature detection

| Feature | Detected |
| --- | --- |
${featureRows.join('\n')}

Detection routes references; it does not replace reading source semantics.

## File inventory

| File | Candidate role | External to source root | Size |
| --- | --- | --- | --- |
${inventoryRows.join('\n')}

## Dependency edges

${dependencyRows.join('\n') || '- none'}

## Third-party packages

${[...packages].sort().map(name => `- \`${name}\``).join('\n') || '- none'}

## Unresolved local imports

${unresolved.map(item => `- \`${projectRelative(item.file, sourceRoot)}\`: \`${item.specifier}\``).join('\n') || '- none'}

## Cycles

${cycles.map(cycle => `- ${cycle.map(file => `\`${projectRelative(file, sourceRoot)}\``).join(' -> ')}`).join('\n') || '- none detected'}

## Semantic ledger

| Source construct | Reads/writes | UI or side-effect dependency | Kuikly destination | Status |
| --- | --- | --- | --- | --- |
| Fill after reading each source file | | | | pending |
`;

    const planRows = order.map((file, index) => {
        const content = contents.get(file) || fs.readFileSync(file, 'utf8');
        return `| ${index + 1} | ${candidateTier(file, content)} | \`${projectRelative(file, sourceRoot)}\` | ${candidateKind(file, content)} | confirm from target conventions | pending |`;
    });
    const styleRows = [...files]
        .filter(file => STYLE_EXTENSIONS.has(path.extname(file).toLowerCase()))
        .sort()
        .map(file => `- \`${projectRelative(file, sourceRoot)}\`: migrate with every importing component; do not generate a standalone Kotlin style file.`);
    const resourceRows = resourceFiles.sort().map(file => `- \`${projectRelative(file, sourceRoot)}\`: include in the resource manifest; copying alone does not prove runtime equivalence.`);
    const plan = `# Vue3 to Kuikly conversion plan

**Source fingerprint**: \`${sourceFingerprint}\`

## Dependency-first order

| Order | Candidate Tier | Source | Candidate role | Target | Status |
| ---: | ---: | --- | --- | --- | --- |
${planRows.join('\n')}

The order is dependency-based. Confirm page/component roles, target names and Tier 0-4 after reading source and target project examples.

## Style inputs

${styleRows.join('\n') || '- none'}

## Resource inputs

${resourceRows.join('\n') || '- No imported physical resource was resolved. The resource migration scan must still inspect template/CSS/public/dynamic references.'}

## Required confirmations

- [ ] Self DSL or Compose DSL is confirmed from target code.
- [ ] Page base class, UI split and package conventions are confirmed.
- [ ] Dynamic imports, runtime component registration and unresolved aliases are resolved.
- [ ] Third-party component behavior is decomposed by props/events/slots/ref methods.
- [ ] Resource manifest is applied; dynamic, symbolic, font and compatibility-sensitive resources have mapping evidence.
- [ ] Every file has a semantic ledger before migration is marked complete.
`;

    const skillDir = path.resolve(__dirname, '..');
    const references = [
        features.scriptSetup || features.compositionApi || features.macros ? 'vue3-semantics-mapping.md' : null,
        features.template ? 'vue-template-style-mapping.md' : null,
        'kuikly-self-dsl-mapping.md',
        features.componentLibrary ? 'component-library-mapping.md' : null,
        features.integration ? 'integration-mapping.md' : null,
        features.resources || features.inlineAssets ? 'resource-migration.md' : null,
        'generation-validation.md',
        features.inlineAssets ? 'preprocess-inline-assets.md' : null,
    ].filter(Boolean);
    const manifest = `# Reference manifest

Read only these references for the detected source features. Verify all Kuikly APIs against the target project.

${references.map(name => `- \`${path.join(skillDir, 'references', name)}\``).join('\n')}
`;

    write(path.join(cacheDir, 'analysis-report.md'), report);
    write(path.join(cacheDir, 'conversion-plan.md'), plan);
    write(path.join(cacheDir, 'reference-manifest.md'), manifest);
    write(path.join(cacheDir, 'source-fingerprint.txt'), sourceFingerprint);
    write(path.join(cacheDir, 'source-files.json'), JSON.stringify({
        sourceInput,
        sourceRoot,
        files: [...files].sort().map(file => ({
            path: file,
            sha256: crypto.createHash('sha256').update(contents.get(file) || fs.readFileSync(file)).digest('hex'),
        })),
    }, null, 2));

    console.log(`Analyzed ${files.size} files (${resourceFiles.length} physical resources).`);
    console.log(`Analysis: ${path.join(cacheDir, 'analysis-report.md')}`);
    console.log(`Plan: ${path.join(cacheDir, 'conversion-plan.md')}`);
    console.log(`References: ${path.join(cacheDir, 'reference-manifest.md')}`);
}

main();
