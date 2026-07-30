#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

const strictBaselines = [
  {
    owner: 'Desktop application',
    path: 'apps/neko-desktop/tsconfig.json',
  },
  {
    owner: 'Agent runtime',
    path: 'packages/neko-agent-runtime/tsconfig.json',
  },
  {
    owner: 'Chara domain package',
    path: 'packages/neko-chara/tsconfig.json',
  },
  {
    owner: 'Quality domain package',
    path: 'packages/neko-quality/tsconfig.json',
  },
];

let failed = false;

for (const baseline of strictBaselines) {
  const absolutePath = resolve(repoRoot, baseline.path);
  const config = JSON.parse(readFileSync(absolutePath, 'utf8'));
  const options = config.compilerOptions ?? {};
  const label = relative(repoRoot, absolutePath);

  const violations = [];
  if (options.strict !== true) {
    violations.push('compilerOptions.strict must be true');
  }
  if (options.strictNullChecks !== true) {
    violations.push('compilerOptions.strictNullChecks must be true');
  }
  if (options.noImplicitAny !== true) {
    violations.push('compilerOptions.noImplicitAny must be true');
  }

  if (violations.length > 0) {
    failed = true;
    console.error(`[strict-tsconfig] ${label} (${baseline.owner}) is not closed:`);
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
  } else {
    console.log(`[strict-tsconfig] ok: ${label}`);
  }
}

if (failed) {
  process.exit(1);
}
