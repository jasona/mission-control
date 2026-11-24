import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const MODULES = [
  { id: 'components/icons.js', rel: 'components/icons.js' },
  { id: 'components/modal.js', rel: 'components/modal.js' },
  { id: 'views/overview.js', rel: 'views/overview.js' },
  { id: 'views/board.js', rel: 'views/board.js' },
  { id: 'views/timeline.js', rel: 'views/timeline.js' },
  { id: 'views/graph.js', rel: 'views/graph.js' },
  { id: 'views/inspector.js', rel: 'views/inspector.js' },
  { id: 'app-main.js', rel: 'app-main.js' },
];

function resolveModuleId(fromRel, spec) {
  const baseDir = dirname(fromRel);
  const resolved = resolve('/', baseDir, spec).slice(1);
  return resolved;
}

function transformModule(mod) {
  const src = readFileSync(join(PUBLIC_DIR, mod.rel), 'utf-8');
  const exportNames = [];

  // Transform multi-line and single-line ES module imports into local bindings from __MC.
  let code = src.replace(
    /^\s*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm,
    (_full, specifiers, fromPath) => {
      const targetId = resolveModuleId(mod.rel, fromPath);
      const cleanSpecs = specifiers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/g, ': '))
        .join(', ');
      return `const { ${cleanSpecs} } = __MC[${JSON.stringify(targetId)}];`;
    },
  );

  // Transform export function declarations.
  code = code.replace(/^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (_m, asyncKw, name) => {
    exportNames.push(name);
    return `${asyncKw || ''}function ${name}`;
  });

  // Transform export const/let/var declarations.
  code = code.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
    exportNames.push(name);
    return `${kind} ${name}`;
  });

  // Transform export { a, b } blocks if any.
  code = code.replace(/^\s*export\s*\{([\s\S]*?)\};?\s*$/gm, (_m, list) => {
    for (const entry of list.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+as\s+/);
      const localName = parts[0].trim();
      const exportName = (parts[1] || parts[0]).trim();
      exportNames.push({ localName, exportName });
    }
    return '';
  });

  const exportEntries = exportNames.map((entry) =>
    typeof entry === 'string'
      ? `${entry}: ${entry}`
      : `${entry.exportName}: ${entry.localName}`
  );

  const indented = code
    .split('\n')
    .map((line) => (line ? `    ${line}` : ''))
    .join('\n');

  return [
    `  // --- ${mod.rel} ---`,
    `  __MC[${JSON.stringify(mod.id)}] = (() => {`,
    indented,
    `    return { ${exportEntries.join(', ')} };`,
    `  })();`,
  ].join('\n');
}

export function buildClientBundle() {
  const parts = [
    '/* Auto-generated classic non-module bundle by build_client.mjs. Do not edit directly; edit app-main.js, views/*, or components/* and re-run build_client.mjs. */',
    '(function () {',
    "  'use strict';",
    '  const __MC = Object.create(null);',
    '',
    ...MODULES.map(transformModule),
    '})();',
    '',
  ];

  const bundle = parts.join('\n');

  // Verify classic non-module script syntax (throws SyntaxError if any import/export leaked).
  // eslint-disable-next-line no-new-func
  new Function(bundle);

  const outPath = join(PUBLIC_DIR, 'app.js');
  writeFileSync(outPath, bundle, 'utf-8');
  return { outPath, bytes: Buffer.byteLength(bundle, 'utf-8'), modules: MODULES.length };
}

const isEntrypoint = Boolean(process.argv[1]) && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isEntrypoint) {
  const res = buildClientBundle();
  console.log(`[build_client] wrote ${res.outPath} (${res.bytes} bytes from ${res.modules} modules)`);
}
