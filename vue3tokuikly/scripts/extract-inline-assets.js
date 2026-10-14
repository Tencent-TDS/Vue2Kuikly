#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MARKER = '.vue3tokuikly-preprocessed';
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const TEXT_EXTENSIONS = new Set(['.vue', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less']);

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
    if (!args.sourceDir) fail('--sourceDir is required');
    if (!args.outputDir) fail('--outputDir is required');
    return args;
}

function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function prepareOutput(sourceDir, outputDir) {
    if (isInside(sourceDir, outputDir) || isInside(outputDir, sourceDir)) {
        fail('source and output directories must be disjoint');
    }
    if (fs.existsSync(outputDir)) {
        const marker = path.join(outputDir, MARKER);
        const entries = fs.readdirSync(outputDir);
        if (entries.length > 0 && !fs.existsSync(marker)) {
            fail(`refusing to overwrite non-owned output directory: ${outputDir}`);
        }
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, MARKER), 'Owned by vue3tokuikly inline asset preprocessing.\n');
}

function copyTree(sourceDir, outputDir) {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
        const source = path.join(sourceDir, entry.name);
        const target = path.join(outputDir, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(target, { recursive: true });
            copyTree(source, target);
        } else if (entry.isFile()) {
            fs.copyFileSync(source, target);
        }
    }
}

function walkTextFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkTextFiles(fullPath));
        else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
    }
    return files;
}

function extensionFor(format) {
    if (format === 'jpeg' || format === 'jpg') return 'jpg';
    if (format === 'svg+xml') return 'svg';
    return format;
}

function normalizeRelative(fromDirectory, target) {
    const relative = path.relative(fromDirectory, target).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const sourceDir = path.resolve(args.sourceDir);
    const outputDir = path.resolve(args.outputDir);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        fail(`source directory does not exist: ${sourceDir}`);
    }

    prepareOutput(sourceDir, outputDir);
    copyTree(sourceDir, outputDir);

    const assetsDir = path.join(outputDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    const manifest = [];
    const failures = [];
    let dynamicSvgCount = 0;
    const dataUriPattern = /data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,([A-Za-z0-9+/=\r\n\t ]+)/g;

    for (const file of walkTextFiles(outputDir)) {
        if (isInside(assetsDir, file)) continue;
        const original = fs.readFileSync(file, 'utf8');
        if (path.extname(file) === '.vue') {
            const svgMatches = original.match(/<svg\b[\s\S]*?<\/svg>/gi) || [];
            dynamicSvgCount += svgMatches.length;
        }
        let changed = false;
        const rewritten = original.replace(dataUriPattern, (fullMatch, format, payload) => {
            try {
                const compactPayload = payload.replace(/\s/g, '');
                const buffer = Buffer.from(compactPayload, 'base64');
                if (buffer.length === 0) throw new Error('decoded asset is empty');
                const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
                const extension = extensionFor(format.toLowerCase());
                const fileName = `inline_${hash}.${extension}`;
                const assetPath = path.join(assetsDir, fileName);
                if (!fs.existsSync(assetPath)) fs.writeFileSync(assetPath, buffer);
                const sourceRelative = path.relative(outputDir, file).split(path.sep).join('/');
                const replacement = normalizeRelative(path.dirname(file), assetPath);
                manifest.push({ sourceRelative, format, hash, assetRelative: `assets/${fileName}` });
                changed = true;
                return replacement;
            } catch (error) {
                failures.push(`${path.relative(outputDir, file)}: ${error.message}`);
                return fullMatch;
            }
        });
        if (changed) fs.writeFileSync(file, rewritten);
    }

    const uniqueManifest = [...new Map(manifest.map(item => [`${item.sourceRelative}:${item.hash}`, item])).values()];
    const manifestLines = uniqueManifest.length > 0
        ? uniqueManifest.map(item => `| \`${item.sourceRelative}\` | ${item.format} | \`${item.hash}\` | \`${item.assetRelative}\` |`)
        : ['| none | - | - | - |'];
    const failureLines = failures.length > 0 ? failures.map(value => `- ${value}`) : ['- none'];
    const report = `# Inline asset manifest

**Source copy**: \`${outputDir}\`
**Extracted assets**: ${uniqueManifest.length}
**Inline SVG blocks left unchanged**: ${dynamicSvgCount}

| Source copy file | MIME subtype | SHA-256 prefix | Asset |
| --- | --- | --- | --- |
${manifestLines.join('\n')}

## Decode failures

${failureLines.join('\n')}

Inline SVG remains in the source copy because Vue bindings, events, CSS variables and animation cannot be removed safely by preprocessing.
`;
    fs.writeFileSync(path.join(outputDir, 'asset-manifest.md'), report);

    console.log(`Source copy: ${outputDir}`);
    console.log(`Extracted assets: ${uniqueManifest.length}`);
    console.log(`Inline SVG blocks left unchanged: ${dynamicSvgCount}`);
    if (failures.length > 0) {
        console.error(`Decode failures: ${failures.length}`);
        process.exitCode = 2;
    }
}

main();
