#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TEXT_EXTENSIONS = new Set(['.vue', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.html']);
const RESOURCE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.apng', '.ico', '.avif', '.heic', '.heif',
    '.ttf', '.otf', '.woff', '.woff2',
    '.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.mp4', '.webm', '.mov', '.m4v',
    '.json', '.lottie', '.pag', '.pdf', '.wasm', '.bin',
]);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const COMPATIBILITY_IMAGE_FORMATS = new Set(['svg', 'gif', 'webp', 'bmp', 'apng', 'ico', 'avif', 'heic', 'heif']);
const NEEDS_MAPPING_KINDS = new Set([
    'dynamic', 'dynamic-template', 'dynamic-loader', 'dynamic-css', 'dynamic-srcset',
    'symbolic', 'inline-svg-dynamic', 'inline-data-unsupported',
    'runtime-generated', 'raw-resource', 'local-missing',
]);
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const MANIFEST_NAME = 'resource-manifest.json';
const MAPPING_NAME = 'resource-mappings.json';

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key.startsWith('--') || !value || value.startsWith('--')) fail(`invalid argument near ${key}`);
        args[key.slice(2)] = value;
        index += 1;
    }
    args.mode = args.mode || 'plan';
    if (!['plan', 'apply', 'validate'].includes(args.mode)) fail('--mode must be plan, apply or validate');
    for (const required of ['pageName', 'workspaceDir']) {
        if (!args[required]) fail(`--${required} is required`);
    }
    if (args.mode !== 'validate' && !args.sourceDir) fail('--sourceDir is required');
    if (args.mode === 'validate' && !args.kotlinDir) fail('--kotlinDir is required for validate mode');
    args.assetScope = args.assetScope || 'page';
    if (!['page', 'common'].includes(args.assetScope)) fail('--assetScope must be page or common');
    return args;
}

function hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walk(directory, extensions) {
    if (!fs.existsSync(directory)) return [];
    const stat = fs.statSync(directory);
    if (stat.isFile()) return extensions.has(path.extname(directory).toLowerCase()) ? [path.resolve(directory)] : [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walk(fullPath, extensions));
        else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(path.resolve(fullPath));
    }
    return files;
}

function inferProjectRoot(sourceInput) {
    let current = fs.statSync(sourceInput).isDirectory() ? sourceInput : path.dirname(sourceInput);
    while (current !== path.dirname(current)) {
        if (fs.existsSync(path.join(current, 'package.json'))) return current;
        current = path.dirname(current);
    }
    return fs.statSync(sourceInput).isDirectory() ? sourceInput : path.dirname(sourceInput);
}

function inferTargetAssetsDir(outputDir) {
    if (!outputDir) return null;
    const absolute = path.resolve(outputDir);
    const marker = `${path.sep}src${path.sep}commonMain${path.sep}kotlin${path.sep}`;
    const index = absolute.indexOf(marker);
    if (index < 0) return null;
    const moduleRoot = absolute.slice(0, index);
    return path.join(moduleRoot, 'src', 'commonMain', 'assets');
}

function importSpecifiers(content) {
    const found = new Set();
    const patterns = [
        /(?:import|export)\s+(?:type\s+)?(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g,
        /(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
        /@import\s+(?:url\(\s*)?["']([^"']+)["']/g,
        /<(?:script|style)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) found.add(match[1]);
    }
    return [...found];
}

function resolveTextDependency(specifier, fromFile, aliasDir) {
    const raw = splitReference(specifier).pathPart;
    const clean = raw.startsWith('~') ? raw.slice(1) : raw;
    let basePath;
    if (clean.startsWith('@/')) basePath = path.resolve(aliasDir, clean.slice(2));
    else if (clean.startsWith('./') || clean.startsWith('../')) basePath = path.resolve(path.dirname(fromFile), clean);
    else return null;

    const extensions = ['', ...TEXT_EXTENSIONS];
    for (const extension of extensions) {
        const candidate = `${basePath}${extension}`;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && TEXT_EXTENSIONS.has(path.extname(candidate).toLowerCase())) {
            return path.resolve(candidate);
        }
    }
    for (const extension of TEXT_EXTENSIONS) {
        const candidate = path.join(basePath, `index${extension}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
    }
    return null;
}

function collectTextFiles(sourceInput, aliasDir) {
    const files = new Set(walk(sourceInput, TEXT_EXTENSIONS));
    const queue = [...files];
    while (queue.length > 0) {
        const file = queue.shift();
        const content = fs.readFileSync(file, 'utf8');
        for (const specifier of importSpecifiers(content)) {
            const dependency = resolveTextDependency(specifier, file, aliasDir);
            if (dependency && !files.has(dependency)) {
                files.add(dependency);
                queue.push(dependency);
            }
        }
    }
    return [...files].sort();
}

function lineNumber(content, index) {
    return content.slice(0, index).split(/\r?\n/).length;
}

function splitReference(raw) {
    const hashIndex = raw.indexOf('#');
    const queryIndex = raw.indexOf('?');
    let end = raw.length;
    if (hashIndex >= 0) end = Math.min(end, hashIndex);
    if (queryIndex >= 0) end = Math.min(end, queryIndex);
    return { pathPart: raw.slice(0, end), suffix: raw.slice(end) };
}

function isRemote(raw) {
    return /^(https?:)?\/\//i.test(raw);
}

function isDataUri(raw) {
    return /^data:image\//i.test(raw);
}

function looksLikeResource(raw) {
    const { pathPart } = splitReference(raw.trim());
    const extension = path.extname(pathPart).toLowerCase();
    return RESOURCE_EXTENSIONS.has(extension) && path.basename(pathPart) !== extension;
}

function parseImageDataUri(raw) {
    const match = raw.match(/^data:image\/([^;,]+)((?:;[^,]*)?),(.*)$/is);
    if (!match) return { error: 'unsupported image data URI' };
    const mimeFormat = match[1].toLowerCase();
    const parameters = match[2].split(';').filter(Boolean).map(value => value.toLowerCase());
    const payload = match[3];
    let buffer;
    try {
        if (parameters.includes('base64')) {
            const encoded = payload.replace(/\s/g, '');
            if (!encoded || !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
                return { error: 'invalid base64 image payload' };
            }
            buffer = Buffer.from(encoded, 'base64');
            if (buffer.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
                return { error: 'invalid base64 image payload' };
            }
        } else {
            buffer = Buffer.from(decodeURIComponent(payload), 'utf8');
        }
    } catch (_error) {
        return { error: 'invalid encoded image payload' };
    }
    if (buffer.length === 0) return { error: 'empty image payload' };
    const extensionMap = { 'jpeg': 'jpg', 'svg+xml': 'svg', 'x-icon': 'ico', 'vnd.microsoft.icon': 'ico' };
    const extension = extensionMap[mimeFormat] || mimeFormat;
    if (!/^[a-z0-9]+$/.test(extension)) return { error: `unsupported image format: ${mimeFormat}` };
    return { buffer, extension };
}

function resolveLocalReference(raw, fromFile, context) {
    const { pathPart, suffix } = splitReference(raw.trim());
    let normalized = pathPart.startsWith('~') ? pathPart.slice(1) : pathPart;
    let candidate;
    if (normalized.startsWith('@/')) {
        candidate = path.resolve(context.aliasDir, normalized.slice(2));
    } else if (normalized.startsWith('/')) {
        candidate = path.resolve(context.publicDir, normalized.slice(1));
    } else if (normalized.startsWith('./') || normalized.startsWith('../')) {
        candidate = path.resolve(path.dirname(fromFile), normalized);
    } else if (path.isAbsolute(normalized)) {
        candidate = normalized;
    } else {
        candidate = path.resolve(path.dirname(fromFile), normalized);
    }
    return {
        resolved: fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? path.resolve(candidate) : null,
        suffix,
        reason: fs.existsSync(candidate) ? 'not a file' : 'file not found',
    };
}

function destinationRelative(sourceFile, context) {
    let relative;
    if (isInside(context.publicDir, sourceFile)) relative = path.relative(context.publicDir, sourceFile);
    else if (isInside(context.aliasDir, sourceFile)) relative = path.relative(context.aliasDir, sourceFile);
    else if (isInside(context.sourceRoot, sourceFile)) relative = path.relative(context.sourceRoot, sourceFile);
    else relative = path.join('external', `${hash(sourceFile).slice(0, 10)}_${path.basename(sourceFile)}`);
    const normalized = relative.split(path.sep).join('/').replace(/^\.\//, '');
    if (!normalized || normalized.startsWith('../')) fail(`unsafe resource destination for ${sourceFile}`);
    return normalized;
}

function normalizeAssetPath(value) {
    const normalized = String(value).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').some(part => part === '..' || part === '')) return null;
    return normalized;
}

function categoryFor(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    if (FONT_EXTENSIONS.has(extension)) return 'font';
    if (['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'].includes(extension)) return 'audio';
    if (['.mp4', '.webm', '.mov', '.m4v'].includes(extension)) return 'video';
    if (['.json', '.lottie'].includes(extension)) return 'structured-data';
    if (extension === '.pag') return 'animation';
    if (extension === '.pdf') return 'document';
    if (['.wasm', '.bin'].includes(extension)) return 'binary-data';
    return 'image';
}

function kotlinExpression(scope, uriPath) {
    const escaped = uriPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return scope === 'common'
        ? `ImageUri.commonAssets("${escaped}")`
        : `ImageUri.pageAssets("${escaped}")`;
}

function createRecord(base) {
    const id = hash(`${base.sourceFile || ''}\0${base.sourceLine || 0}\0${base.kind}\0${base.rawReference}\0${base.resolvedSource || ''}`).slice(0, 16);
    return { id, ...base };
}

function discoverResources(args) {
    const sourceInput = path.resolve(args.sourceDir);
    if (!fs.existsSync(sourceInput)) fail(`source path does not exist: ${sourceInput}`);
    const sourceRoot = fs.statSync(sourceInput).isDirectory() ? sourceInput : path.dirname(sourceInput);
    const projectRoot = args.projectRoot ? path.resolve(args.projectRoot) : inferProjectRoot(sourceInput);
    const aliasDir = args.aliasDir ? path.resolve(args.aliasDir) : path.join(projectRoot, 'src');
    const publicDir = args.publicDir ? path.resolve(args.publicDir) : path.join(projectRoot, 'public');
    const targetAssetsDir = args.targetAssetsDir
        ? path.resolve(args.targetAssetsDir)
        : inferTargetAssetsDir(args.outputDir);
    const namespace = normalizeAssetPath(args.assetNamespace || args.pageName);
    if (!namespace) fail('--assetNamespace/--pageName must be a safe relative asset namespace');
    const context = { sourceRoot, projectRoot, aliasDir, publicDir, targetAssetsDir, namespace };
    const textFiles = collectTextFiles(sourceInput, aliasDir);
    const records = [];
    const issues = [];
    const seen = new Set();
    const referencedPhysical = new Set();
    const textContents = new Map(textFiles.map(file => [file, fs.readFileSync(file, 'utf8')]));
    const hasVant = [...textContents.values()].some(content => /\bfrom\s+["']vant["']|<van-/i.test(content));

    function addRecord(record) {
        const key = `${record.sourceFile || ''}\0${record.sourceLine || 0}\0${record.kind}\0${record.rawReference}`;
        if (seen.has(key)) return;
        seen.add(key);
        records.push(createRecord(record));
    }

    function addReference(file, content, rawReference, origin, index) {
        const raw = rawReference.trim();
        if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;
        const sourceLine = lineNumber(content, index);
        if (/\$\{|[*]/.test(raw)) {
            addRecord({
                kind: 'dynamic-template', sourceFile: file, sourceLine, origin, rawReference: raw,
                status: 'needs-mapping', note: 'Enumerate runtime values and map every local, remote and failure path.',
            });
            return;
        }
        if (isDataUri(raw)) {
            const parsed = parseImageDataUri(raw);
            if (parsed.error) {
                addRecord({
                    kind: 'inline-data-unsupported', sourceFile: file, sourceLine, origin,
                    rawReference: raw, status: 'needs-mapping', note: parsed.error,
                });
                return;
            }
            const { buffer, extension } = parsed;
            const contentHash = hash(buffer);
            const uriPath = `inline/inline_${contentHash.slice(0, 16)}.${extension}`;
            addRecord({
                kind: 'inline-data', category: 'image', format: extension,
                requiresMapping: COMPATIBILITY_IMAGE_FORMATS.has(extension), sourceFile: file, sourceLine, origin,
                rawReference: raw, contentHash, uriPath,
                targetRelative: args.assetScope === 'common' ? `common/${uriPath}` : `${namespace}/${uriPath}`,
                kotlinExpression: kotlinExpression(args.assetScope, uriPath), status: 'planned',
            });
            return;
        }
        if (isRemote(raw)) {
            addRecord({ kind: 'remote', sourceFile: file, sourceLine, origin, rawReference: raw, status: 'preserve-runtime', note: 'Keep URL and loading/error semantics.' });
            return;
        }
        if (!looksLikeResource(raw)) return;
        const resolution = resolveLocalReference(raw, file, context);
        if (!resolution.resolved) {
            addRecord({ kind: 'local-missing', sourceFile: file, sourceLine, origin, rawReference: raw, status: 'unresolved', note: resolution.reason });
            issues.push(`Unresolved local resource ${raw} at ${file}:${sourceLine}`);
            return;
        }
        if (/(?:[?&])raw(?:[=&]|$)/.test(resolution.suffix)) {
            referencedPhysical.add(resolution.resolved);
            addRecord({ kind: 'raw-resource', sourceFile: file, sourceLine, origin, rawReference: raw, resolvedSource: resolution.resolved, status: 'unresolved', note: 'Vite ?raw imports file contents, not an asset URL.' });
            return;
        }
        const uriPath = destinationRelative(resolution.resolved, context);
        const buffer = fs.readFileSync(resolution.resolved);
        const category = categoryFor(resolution.resolved);
        const format = path.extname(resolution.resolved).toLowerCase().slice(1);
        referencedPhysical.add(resolution.resolved);
        addRecord({
            kind: 'local', category, format, sourceFile: file, sourceLine, origin,
            rawReference: raw, resolvedSource: resolution.resolved, contentHash: hash(buffer), uriPath,
            targetRelative: args.assetScope === 'common' ? `common/${uriPath}` : `${namespace}/${uriPath}`,
            kotlinExpression: category === 'image' ? kotlinExpression(args.assetScope, uriPath) : undefined,
            requiresMapping: category !== 'image' || COMPATIBILITY_IMAGE_FORMATS.has(format) || /(?:[?&])inline(?:[=&]|$)/.test(resolution.suffix),
            status: 'planned',
            note: resolution.suffix || undefined,
        });
    }

    for (const file of textFiles) {
        const content = textContents.get(file);

        const quoted = /(["'`])([^"'`\r\n]+)\1/g;
        let match;
        while ((match = quoted.exec(content)) !== null) {
            if (looksLikeResource(match[2]) || isRemote(match[2]) || isDataUri(match[2])) {
                addReference(file, content, match[2], 'quoted-reference', match.index);
            }
        }

        const cssUrl = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
        while ((match = cssUrl.exec(content)) !== null) addReference(file, content, match[2], 'css-url', match.index);

        const dynamicCssUrl = /url\(\s*(var\([^)]*\)|v-bind\([^)]*\))/g;
        while ((match = dynamicCssUrl.exec(content)) !== null) {
            addRecord({
                kind: 'dynamic-css', sourceFile: file, sourceLine: lineNumber(content, match.index),
                origin: 'css-url', rawReference: match[1], status: 'needs-mapping',
                note: 'Preserve the CSS variable or Vue binding value domain and fallback.',
            });
        }

        const boundResource = /(?::|v-bind:)(src|href|poster)\s*=\s*(["'])(.*?)\2/g;
        while ((match = boundResource.exec(content)) !== null) {
            const expression = match[3].trim();
            const staticExpression = expression.match(/^(["'`])([\s\S]*)\1$/);
            if (staticExpression && !/\$\{/.test(staticExpression[2])) {
                addReference(file, content, staticExpression[2], `v-bind:${match[1]}-static`, match.index);
            } else {
                addRecord({
                    kind: 'dynamic', sourceFile: file, sourceLine: lineNumber(content, match.index),
                    origin: `v-bind:${match[1]}`, rawReference: expression, status: 'needs-mapping',
                    note: 'Trace every runtime value source and preserve local/remote/error behavior.',
                });
            }
        }

        const srcset = /(?:^|[\s<])srcset\s*=\s*(["'])(.*?)\1/gm;
        while ((match = srcset.exec(content)) !== null) {
            for (const candidate of match[2].split(',')) {
                const raw = candidate.trim().split(/\s+/)[0];
                addReference(file, content, raw, 'srcset', match.index);
            }
        }
        const dynamicSrcset = /(?::|v-bind:)srcset\s*=\s*(["'])(.*?)\1/g;
        while ((match = dynamicSrcset.exec(content)) !== null) {
            addRecord({
                kind: 'dynamic-srcset', sourceFile: file, sourceLine: lineNumber(content, match.index),
                origin: 'v-bind:srcset', rawReference: match[2], status: 'needs-mapping',
                note: 'Preserve candidate URLs, density/width descriptors and selection behavior.',
            });
        }

        const dynamicLoader = /\b(require|new\s+URL)\s*\(\s*([^,\n)]+)/g;
        while ((match = dynamicLoader.exec(content)) !== null) {
            const expression = match[2].trim();
            if (!/\$\{/.test(expression) && !/^["'`][^${}]*["'`]$/.test(expression)) {
                addRecord({
                    kind: 'dynamic-loader', sourceFile: file, sourceLine: lineNumber(content, match.index),
                    origin: match[1], rawReference: expression, status: 'needs-mapping',
                    note: 'Enumerate the loader input domain and preserve bundler/runtime failure behavior.',
                });
            }
        }

        const vanTag = /<van-(icon|tabbar-item)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
        while ((match = vanTag.exec(content)) !== null) {
            const tag = match[0];
            const literal = tag.match(/(?:^|\s)(?:name|icon)\s*=\s*(["'])(.*?)\1/i);
            const dynamic = tag.match(/:(?:name|icon)\s*=\s*(["'])(.*?)\1/i);
            const value = dynamic ? dynamic[2] : literal ? literal[2] : null;
            if (value) {
                addRecord({
                    kind: 'symbolic', sourceFile: file, sourceLine: lineNumber(content, match.index),
                    origin: `van-${match[1]}`, rawReference: value,
                    status: 'needs-mapping', note: dynamic ? 'Trace dynamic Vant icon values.' : 'Map Vant icon name to a target asset or icon module.',
                });
            }
        }

        const svgBlock = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
        while ((match = svgBlock.exec(content)) !== null) {
            const block = match[0];
            const dynamic = /(?:[:@][\w-]+|v-[\w-]+)\s*=|\{\{|var\(|<animate\b|<script\b/i.test(block);
            if (dynamic) {
                addRecord({ kind: 'inline-svg-dynamic', sourceFile: file, sourceLine: lineNumber(content, match.index), origin: 'inline-svg', rawReference: block, status: 'needs-mapping', note: 'Preserve bindings, events, CSS variables and animation.' });
            } else {
                const contentHash = hash(block);
                const uriPath = `inline/inline_${contentHash.slice(0, 16)}.svg`;
                addRecord({
                    kind: 'inline-svg-static', category: 'image', format: 'svg', requiresMapping: true,
                    sourceFile: file, sourceLine: lineNumber(content, match.index), origin: 'inline-svg',
                    rawReference: block, contentHash, uriPath,
                    targetRelative: args.assetScope === 'common' ? `common/${uriPath}` : `${namespace}/${uriPath}`,
                    kotlinExpression: kotlinExpression(args.assetScope, uriPath), status: 'planned',
                    note: 'Verify target image adapter supports SVG before using the URI.',
                });
            }
        }

        const runtimeResource = /\b(URL\.createObjectURL|FileReader|readAsDataURL|canvas\.toDataURL)\b/g;
        while ((match = runtimeResource.exec(content)) !== null) {
            addRecord({ kind: 'runtime-generated', sourceFile: file, sourceLine: lineNumber(content, match.index), origin: 'runtime-resource', rawReference: match[1], status: 'needs-mapping', note: 'Use an existing Kuikly file/base64/module path and preserve cleanup.' });
        }

        if (hasVant) {
            const iconField = /\bicon\s*:\s*["']([^"']+)["']/g;
            while ((match = iconField.exec(content)) !== null) {
                addRecord({ kind: 'symbolic', sourceFile: file, sourceLine: lineNumber(content, match.index), origin: 'vant-icon-field', rawReference: match[1], status: 'needs-mapping', note: 'Confirm this field feeds a Vant icon before mapping.' });
            }
        }
    }

    const inventoryRoots = [sourceInput, path.join(aliasDir, 'assets'), publicDir, ...textFiles.map(file => path.dirname(file))]
        .filter((value, index, array) => fs.existsSync(value) && array.indexOf(value) === index);
    const physicalResources = new Set(inventoryRoots.flatMap(root => walk(root, RESOURCE_EXTENSIONS)));
    for (const resource of [...physicalResources].sort()) {
        if (!referencedPhysical.has(resource)) {
            addRecord({
                kind: 'unreferenced', category: categoryFor(resource), format: path.extname(resource).toLowerCase().slice(1), sourceFile: resource,
                origin: 'physical-inventory', rawReference: projectRelative(resource, projectRoot),
                resolvedSource: resource, contentHash: hash(fs.readFileSync(resource)), status: 'review',
                note: 'Do not copy unless runtime lookup or an omitted reference proves it is used.',
            });
        }
    }

    if (!targetAssetsDir) issues.push('Cannot infer target assets directory; pass --targetAssetsDir or an outputDir under src/commonMain/kotlin.');

    records.sort((left, right) => {
        const leftKey = `${left.sourceFile || ''}:${left.sourceLine || 0}:${left.kind}:${left.rawReference}`;
        const rightKey = `${right.sourceFile || ''}:${right.sourceLine || 0}:${right.kind}:${right.rawReference}`;
        return leftKey.localeCompare(rightKey);
    });

    return {
        version: 1,
        pageName: args.pageName,
        sourceInput,
        projectRoot,
        aliasDir,
        publicDir,
        targetAssetsDir,
        assetScope: args.assetScope,
        assetNamespace: namespace,
        records,
        issues,
    };
}

function projectRelative(file, root) {
    const relative = path.relative(root, file);
    return relative.startsWith('..') ? file : relative.split(path.sep).join('/');
}

function targetFileFor(manifest, record) {
    if (!record.targetRelative || !manifest.targetAssetsDir) return null;
    const targetFile = path.resolve(manifest.targetAssetsDir, ...record.targetRelative.split('/'));
    return isInside(path.resolve(manifest.targetAssetsDir), targetFile) ? targetFile : null;
}

function contentForGeneratedRecord(record) {
    if (record.kind === 'inline-data') {
        const parsed = parseImageDataUri(record.rawReference);
        if (parsed.error) fail(`inline data changed during migration: ${parsed.error}`);
        return parsed.buffer;
    }
    if (record.kind === 'inline-svg-static') return Buffer.from(record.rawReference);
    return fs.readFileSync(record.resolvedSource);
}

function readMappings(args) {
    const cacheDir = path.join(path.resolve(args.workspaceDir), 'cache');
    const mappingPath = args.mappingFile ? path.resolve(args.mappingFile) : path.join(cacheDir, MAPPING_NAME);
    if (!fs.existsSync(mappingPath)) return {};
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8')).mappings || {};
}

function applyMappingDecisions(manifest, mappings) {
    const errors = [];
    const context = {
        sourceRoot: manifest.sourceInput,
        projectRoot: manifest.projectRoot,
        aliasDir: manifest.aliasDir,
        publicDir: manifest.publicDir,
        targetAssetsDir: manifest.targetAssetsDir,
        namespace: manifest.assetNamespace,
    };
    for (const record of manifest.records) {
        const mapping = mappings[record.id];
        if (!mapping || mapping.copy !== true) continue;
        if (record.kind !== 'unreferenced') {
            errors.push(`copy is only valid for unreferenced inventory records: ${record.id}`);
            continue;
        }
        if (!['runtime', 'converted'].includes(mapping.resolution)) {
            errors.push(`Unreferenced copy ${record.id} requires resolution runtime or converted.`);
            continue;
        }
        const requestedPath = mapping.uriPath || destinationRelative(record.resolvedSource, context);
        const uriPath = normalizeAssetPath(requestedPath);
        if (!uriPath) {
            errors.push(`Unsafe uriPath for ${record.id}: ${requestedPath}`);
            continue;
        }
        record.copyRequested = true;
        record.uriPath = uriPath;
        record.targetRelative = manifest.assetScope === 'common'
            ? `common/${uriPath}`
            : `${manifest.assetNamespace}/${uriPath}`;
        if (record.category === 'image') record.kotlinExpression = kotlinExpression(manifest.assetScope, uriPath);
    }
    return errors;
}

function applyResources(manifest) {
    if (!manifest.targetAssetsDir) fail('target assets directory is unresolved');
    const collisionMap = new Map();
    const operations = [];
    for (const record of manifest.records) {
        if (!['local', 'inline-data', 'inline-svg-static'].includes(record.kind) && !record.copyRequested) continue;
        const targetFile = targetFileFor(manifest, record);
        if (!targetFile) fail(`unsafe or unresolved target path for ${record.id}`);
        const content = contentForGeneratedRecord(record);
        const contentHash = hash(content);
        if (record.contentHash !== contentHash) fail(`resource changed during migration: ${record.rawReference}`);
        const collisionKey = targetFile.toLowerCase();
        const previous = collisionMap.get(collisionKey);
        if (previous && (previous.targetFile !== targetFile || previous.contentHash !== contentHash)) {
            fail(`two resources collide at ${previous.targetFile} and ${targetFile}`);
        }
        collisionMap.set(collisionKey, { targetFile, contentHash });
        if (fs.existsSync(targetFile)) {
            const existingHash = hash(fs.readFileSync(targetFile));
            if (existingHash !== contentHash) fail(`refusing to overwrite different target asset: ${targetFile}`);
        }
        operations.push({ record, targetFile, content });
    }
    for (const { record, targetFile, content } of operations) {
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        if (fs.existsSync(targetFile)) record.status = 'reused';
        else {
            fs.writeFileSync(targetFile, content);
            record.status = 'copied';
        }
        record.targetFile = targetFile;
    }
}

function markdownReport(manifest) {
    const rows = manifest.records.map(record => {
        const source = record.sourceFile ? `${projectRelative(record.sourceFile, manifest.projectRoot)}${record.sourceLine ? `:${record.sourceLine}` : ''}` : '-';
        const target = record.targetRelative ? `\`${record.targetRelative}\`` : '-';
        const expression = record.kotlinExpression ? `\`${record.kotlinExpression}\`` : '-';
        const raw = record.rawReference.length > 80 ? `${record.rawReference.slice(0, 77)}...` : record.rawReference;
        return `| \`${record.id}\` | ${record.kind} | \`${source}\` | \`${raw.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')}\` | ${target} | ${expression} | ${record.status} |`;
    });
    return `# Resource migration manifest

**Page**: ${manifest.pageName}
**Asset scope**: ${manifest.assetScope}
**Asset namespace**: ${manifest.assetNamespace}
**Target assets root**: ${manifest.targetAssetsDir ? `\`${manifest.targetAssetsDir}\`` : 'unresolved'}

| ID | Kind | Source | Reference | Target | Kuikly expression | Status |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n') || '| - | - | - | - | - | - | no resources detected |'}

## Issues

${manifest.issues.map(issue => `- ${issue}`).join('\n') || '- none'}

## Mapping file

Resolve every \`needs-mapping\`, \`unresolved\`, \`review\` or compatibility-sensitive record in \`${MAPPING_NAME}\` with:

\`{ "mappings": { "<record-id>": { "resolution": "runtime|existing-target|converted|host-registered|not-used", "copy": false, "uriPath": "optional target path", "evidence": "exact Kotlin token", "note": "why this is equivalent" } } }\`

\`not-used\` is valid only for an unreferenced inventory item and does not require Kotlin evidence. Set \`copy: true\` only for a proven runtime/converted unreferenced resource.
`;
}

function writeManifest(args, manifest) {
    const cacheDir = path.join(path.resolve(args.workspaceDir), 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(cacheDir, 'resource-manifest.md'), markdownReport(manifest));
    const mappingFile = path.join(cacheDir, MAPPING_NAME);
    if (!fs.existsSync(mappingFile)) fs.writeFileSync(mappingFile, '{\n  "version": 1,\n  "mappings": {}\n}\n');
    console.log(`Resource manifest: ${path.join(cacheDir, 'resource-manifest.md')}`);
    console.log(`Resource mappings: ${mappingFile}`);
}

function readAllKotlin(directory) {
    return walk(directory, new Set(['.kt'])).map(file => fs.readFileSync(file, 'utf8')).join('\n');
}

function validateResources(args) {
    const cacheDir = path.join(path.resolve(args.workspaceDir), 'cache');
    const manifestPath = path.join(cacheDir, MANIFEST_NAME);
    if (!fs.existsSync(manifestPath)) fail(`resource manifest not found: ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const mappings = readMappings(args);
    const kotlin = readAllKotlin(path.resolve(args.kotlinDir));
    const errors = [...manifest.issues, ...applyMappingDecisions(manifest, mappings)];
    const recordIds = new Set(manifest.records.map(record => record.id));
    for (const mappingId of Object.keys(mappings)) {
        if (!recordIds.has(mappingId)) errors.push(`Stale resource mapping has no manifest record: ${mappingId}`);
    }

    function mappingEvidence(record, required = true) {
        const mapping = mappings[record.id];
        if (!mapping) {
            if (required) errors.push(`Missing mapping for ${record.id} (${record.kind}: ${record.rawReference.slice(0, 80)})`);
            return false;
        }
        const allowed = new Set(['runtime', 'existing-target', 'converted', 'host-registered', 'not-used']);
        if (!allowed.has(mapping.resolution) || typeof mapping.note !== 'string' || !mapping.note.trim()) {
            errors.push(`Incomplete mapping for ${record.id}; a supported resolution and note are required.`);
            return false;
        }
        if (mapping.resolution === 'not-used') {
            if (record.kind !== 'unreferenced') errors.push(`not-used is only valid for unreferenced resources: ${record.id}`);
            return true;
        }
        if (typeof mapping.evidence !== 'string' || !mapping.evidence.trim()) {
            errors.push(`Kotlin evidence is required for ${record.id}.`);
            return false;
        }
        if (!kotlin.includes(mapping.evidence)) errors.push(`Mapping evidence not found in Kotlin for ${record.id}: ${mapping.evidence}`);
        return true;
    }

    for (const record of manifest.records) {
        if (['local', 'inline-data', 'inline-svg-static'].includes(record.kind) || record.copyRequested) {
            const targetFile = targetFileFor(manifest, record);
            if (!targetFile || !fs.existsSync(targetFile)) {
                errors.push(`Missing target asset for ${record.id}: ${targetFile || 'unresolved target'}`);
                continue;
            }
            if (hash(fs.readFileSync(targetFile)) !== record.contentHash) errors.push(`Target asset hash mismatch: ${targetFile}`);
            if (record.kind === 'unreferenced' || record.requiresMapping) mappingEvidence(record);
            else if (!kotlin.includes(record.kotlinExpression || record.uriPath)) mappingEvidence(record);
        } else if (record.kind === 'remote') {
            if (!kotlin.includes(record.rawReference)) mappingEvidence(record);
        } else if (NEEDS_MAPPING_KINDS.has(record.kind)) {
            mappingEvidence(record);
        } else if (record.kind === 'unreferenced') {
            mappingEvidence(record);
        }
    }

    const reportPath = path.join(cacheDir, 'resource-validation.md');
    fs.writeFileSync(reportPath, `# Resource validation\n\n${errors.length === 0 ? '- passed' : errors.map(error => `- ${error}`).join('\n')}\n`);
    if (errors.length > 0) {
        console.error(`Resource validation failed with ${errors.length} issue(s). See ${reportPath}`);
        process.exit(2);
    }
    console.log(`Resource validation passed: ${reportPath}`);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.mode === 'validate') {
        validateResources(args);
        return;
    }
    const manifest = discoverResources(args);
    if (args.mode === 'apply') manifest.issues.push(...applyMappingDecisions(manifest, readMappings(args)));
    const hardIssues = manifest.records.filter(record => record.kind === 'local-missing').length + manifest.issues.length;
    if (args.mode === 'apply' && hardIssues > 0) {
        writeManifest(args, manifest);
        console.error('Resource apply stopped because the manifest has unresolved hard issues.');
        process.exitCode = 2;
        return;
    }
    if (args.mode === 'apply') applyResources(manifest);
    writeManifest(args, manifest);
    if (hardIssues > 0) process.exitCode = 2;
}

main();
