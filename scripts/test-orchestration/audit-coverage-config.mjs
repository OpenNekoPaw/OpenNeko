#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function auditCoverageConfigs(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const ownership = options.ownership ?? JSON.parse(
    await readFile(join(root, 'quality/test-ownership.json'), 'utf8'),
  );
  const owners = [
    ...new Set(
      ownership.workspaces
        .filter((entry) => entry.mode !== 'alternative')
        .map((entry) => entry.owner),
    ),
  ].sort();
  const errors = [];
  for (const owner of owners) {
    const configPath = join(root, owner, 'vitest.config.ts');
    let source;
    try {
      source = await readFile(configPath, 'utf8');
    } catch {
      errors.push(`${owner} has no vitest.config.ts`);
      continue;
    }
    if (!source.includes('sharedCoverage')) {
      errors.push(`${owner}/vitest.config.ts does not use sharedCoverage`);
    }
    if (!/sharedCoverage\s*\(\s*\{[\s\S]*?include\s*:/u.test(source)) {
      errors.push(`${owner}/vitest.config.ts has no explicit coverage include`);
    }
    if (/include\s*:\s*\[\s*\]/u.test(source)) {
      errors.push(`${owner}/vitest.config.ts has an empty coverage include`);
    }
  }
  const result = {
    schemaVersion: 'neko.coverage-ownership-audit.v1',
    ok: errors.length === 0,
    owners: owners.length,
    errors,
  };
  if (!result.ok && options.throwOnError !== false) {
    throw new Error(`Coverage ownership audit failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
  return result;
}

async function main() {
  process.stdout.write(`${JSON.stringify(await auditCoverageConfigs(), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
