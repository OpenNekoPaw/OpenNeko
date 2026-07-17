import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { findProductBrandViolations, runProductBrandCheck } from './check-product-brand.mjs';

test('reports retired product labels with line diagnostics and canonical replacements', () => {
  const retiredProduct = ['Neko', ' Suite'].join('');
  const retiredClient = ['Neko', ' TUI'].join('');
  assert.deepEqual(
    findProductBrandViolations('README.md', `heading\n${retiredProduct}\n${retiredClient}`),
    [
      {
        file: 'README.md',
        line: 2,
        column: 1,
        retired: retiredProduct,
        replacement: 'OpenNeko',
      },
      {
        file: 'README.md',
        line: 3,
        column: 1,
        retired: retiredClient,
        replacement: 'OpenNeko TUI',
      },
    ],
  );
});

test('accepts canonical labels and stable technical identifiers', () => {
  const content = [
    'OpenNeko',
    'OpenNeko TUI',
    'OpenNeko for VSCode',
    '@neko/shared',
    'neko.neko-suite',
    'NekoSuitePluginTransferHostAdapter',
  ].join('\n');
  assert.deepEqual(findProductBrandViolations('example.ts', content), []);
});

test('reports the most specific retired label once when rules overlap', () => {
  const retiredAssistant = ['Neko', ' AI Assistant'].join('');
  assert.deepEqual(findProductBrandViolations('label.ts', retiredAssistant), [
    {
      file: 'label.ts',
      line: 1,
      column: 1,
      retired: retiredAssistant,
      replacement: 'OpenNeko AI Assistant',
    },
  ]);
});

test('scans current first-party files and excludes archived or generated surfaces', () => {
  const root = mkdtempSync(join(tmpdir(), 'openneko-brand-'));
  const retiredProduct = ['Neko', ' Suite'].join('');
  try {
    write(root, 'README.md', '# OpenNeko\n');
    write(root, 'packages/example/src/index.ts', `export const label = '${retiredProduct}';\n`);
    write(root, 'openspec/changes/archive/old/proposal.md', retiredProduct);
    write(root, 'outputs/user-artifact.md', retiredProduct);
    write(root, 'packages/example/dist/generated.js', retiredProduct);

    const result = runProductBrandCheck(root);

    assert.equal(result.status, 'failed');
    assert.deepEqual(
      result.findings.map(({ file, line }) => ({ file, line })),
      [{ file: 'packages/example/src/index.ts', line: 1 }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}
