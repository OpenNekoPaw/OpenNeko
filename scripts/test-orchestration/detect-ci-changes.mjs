#!/usr/bin/env node
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT_TS_INPUTS = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.json',
  'eslint.config.mjs',
  'knip.json',
  '.dependency-cruiser.cjs',
]);

export function detectCiChanges(files) {
  const result = { ts: false, rust: false, proto: false, openspec: false };
  for (const rawFile of files) {
    const file = rawFile.trim().replaceAll('\\', '/');
    if (!file) continue;
    result.ts ||= isTypeScriptValidationInput(file);
    result.rust ||= file.startsWith('packages/neko-engine/');
    result.proto ||=
      file.startsWith('packages/neko-proto/') ||
      file.startsWith('packages/neko-types/src/generated/') ||
      file === 'scripts/proto-gen-ts.mjs';
    result.openspec ||= file.startsWith('openspec/');
  }
  return result;
}

export function isTypeScriptValidationInput(file) {
  return (
    ROOT_TS_INPUTS.has(file) ||
    file.startsWith('.github/workflows/') ||
    file.startsWith('quality/') ||
    file.startsWith('openspec/') ||
    file.startsWith('scripts/') ||
    /^packages\/.+\/(?:src|scripts)\/.+\.(?:[cm]?[jt]sx?|json|css|scss|html)$/u.test(file) ||
    /^packages\/.+\/(?:package\.json|vitest\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|tsconfig(?:\.[^.]+)?\.json)$/u.test(file) ||
    /^(?:vitest|vite)\..*config\.[cm]?[jt]s$/u.test(file)
  );
}

async function main() {
  const files = (await readStdin()).split(/\r?\n/u).filter(Boolean);
  const result = detectCiChanges(files);
  const outputIndex = process.argv.indexOf('--github-output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--github-output requires a path');
    await appendFile(
      outputPath,
      Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
      'utf8',
    );
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

function readStdin() {
  return new Promise((resolvePromise, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => resolvePromise(input));
    process.stdin.on('error', reject);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
