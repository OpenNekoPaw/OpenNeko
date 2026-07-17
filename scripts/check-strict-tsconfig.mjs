#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

const extensionBaselines = [
  {
    owner: 'Agent extension',
    path: 'packages/neko-agent/packages/extension/tsconfig.json',
  },
];

let failed = false;

for (const baseline of extensionBaselines) {
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
