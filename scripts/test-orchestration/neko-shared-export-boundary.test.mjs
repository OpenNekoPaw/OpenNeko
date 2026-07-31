import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkRetiredSharedModules } from '../check-neko-shared-exports.mjs';

const retiredModule = {
  source: 'packages/neko-types/src/types/retired-contract.ts',
  semanticOwner: '@neko/example',
  layer: 'L0',
  disposition: 'remove',
  target: null,
  dataImpact: 'none',
  reason: 'Fixture retired contract.',
};

async function createFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'neko-shared-exports-'));
  await Promise.all([
    mkdir(path.join(rootDir, 'apps/example/src'), { recursive: true }),
    mkdir(path.join(rootDir, 'packages/neko-types/src/types'), { recursive: true }),
    mkdir(path.join(rootDir, 'quality/ledgers'), { recursive: true }),
  ]);
  await writeFile(
    path.join(rootDir, 'quality/ledgers/neko-shared-retired-module-ledger.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        package: '@neko/shared',
        retiredRootExports: ['RetiredContract'],
        modules: [retiredModule],
      },
      null,
      2,
    )}\n`,
  );
  return rootDir;
}

test('retired Shared modules remain absent and unimportable', async () => {
  assert.deepEqual(await checkRetiredSharedModules(), []);
});

test('retired Shared module guard rejects source and direct public imports', async () => {
  const rootDir = await createFixture();
  await Promise.all([
    writeFile(
      path.join(rootDir, retiredModule.source),
      'export interface RetiredContract { readonly id: string; }\n',
    ),
    writeFile(
      path.join(rootDir, 'apps/example/src/consumer.ts'),
      "import type { RetiredContract } from '@neko/shared/types/retired-contract';\n",
    ),
  ]);

  const errors = await checkRetiredSharedModules({ rootDir });

  assert.ok(
    errors.some((error) => error.includes('retired Shared source still exists')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('imports retired Shared entry')),
    errors.join('\n'),
  );
});

test('retired Shared root symbols cannot be exported or imported again', async () => {
  const rootDir = await createFixture();
  await Promise.all([
    writeFile(
      path.join(rootDir, 'packages/neko-types/src/types/index.ts'),
      'export interface RetiredContract { readonly id: string; }\n',
    ),
    writeFile(
      path.join(rootDir, 'packages/neko-types/src/index.ts'),
      "export * from './types/index';\n",
    ),
    writeFile(
      path.join(rootDir, 'apps/example/src/consumer.ts'),
      "import type { RetiredContract } from '@neko/shared';\n",
    ),
  ]);

  const errors = await checkRetiredSharedModules({ rootDir });

  assert.ok(
    errors.some((error) => error.includes('retired Shared root export is public again')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('imports retired Shared root export')),
    errors.join('\n'),
  );
});
