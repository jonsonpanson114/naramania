import fs from 'fs';
import path from 'path';

const SEARCH_ROOTS = ['src', 'scripts', '.github'];
const SEARCH_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.yml', '.yaml', '.json']);
const IGNORED_PATH_PARTS = [
    `${path.sep}node_modules${path.sep}`,
    `${path.sep}.next${path.sep}`,
    `${path.sep}output${path.sep}`,
];

const BANNED_MODELS = [
    {
        model: 'gemini-3.1-flash-lite-preview',
        replacement: 'gemini-2.5-flash-lite',
    },
    {
        model: 'gemini-3.1-flash',
        replacement: 'gemini-2.5-flash',
    },
    {
        model: 'gemini-3.1-flash-lite',
        replacement: 'gemini-2.5-flash-lite',
    },
    {
        model: 'gemini-3.5-flash',
        replacement: 'gemini-2.5-flash',
    },
];

function walkFiles(root: string): string[] {
    if (!fs.existsSync(root)) return [];

    const absoluteRoot = path.resolve(root);
    const files: string[] = [];
    const stack = [absoluteRoot];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        if (IGNORED_PATH_PARTS.some((part) => current.includes(part))) continue;

        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            fs.readdirSync(current).forEach((child) => stack.push(path.join(current, child)));
            continue;
        }

        if (SEARCH_EXTENSIONS.has(path.extname(current))) {
            files.push(current);
        }
    }

    return files;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
    const findings: string[] = [];
    const files = SEARCH_ROOTS.flatMap(walkFiles).filter((file) =>
        path.relative(process.cwd(), file).replace(/\\/g, '/') !== 'scripts/validate_ai_models.ts',
    );

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const banned of BANNED_MODELS) {
            const modelPattern = new RegExp(`${escapeRegExp(banned.model)}(?![-\\w])`);
            if (!modelPattern.test(content)) continue;
            findings.push(`${path.relative(process.cwd(), file)} uses ${banned.model}; use ${banned.replacement}`);
        }
    }

    if (findings.length > 0) {
        console.error(`[ai-models] deprecated Gemini model references found:\n${findings.join('\n')}`);
        process.exit(1);
    }

    console.log('[ai-models] validation passed');
}

main();
