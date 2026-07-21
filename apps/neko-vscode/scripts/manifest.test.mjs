import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appRoot, '../..');
const manifest = readJson(resolve(appRoot, 'package.json'));
const groups = readJson(resolve(repoRoot, 'scripts/package-groups.json'));

const retainedReleaseExtensions = [
  'neko-engine',
  'neko-tools',
  'neko-preview',
  'neko-assets',
  'neko-cut',
  'neko-canvas',
  'neko-agent',
];

test('application composition contains exactly the retained release features', () => {
  assert.deepEqual(groups.packages.buildRelease, retainedReleaseExtensions);
  assert.equal(new Set(groups.packages.buildRelease).size, retainedReleaseExtensions.length);
});

test('OpenNeko is the single runtime extension rather than an extension pack', () => {
  assert.equal(manifest.displayName, 'OpenNeko');
  assert.equal(manifest.name, 'neko-suite');
  assert.equal(manifest.publisher, 'neko');
  assert.equal(manifest.main, './dist/extension.js');
  assert.equal(manifest.browser, undefined);
  assert.deepEqual(manifest.activationEvents, ['onStartupFinished']);
  assert.equal(manifest.contributes, undefined);
  assert.equal(manifest.extensionPack, undefined);
  assert.equal(manifest.extensionDependencies, undefined);
  assert.ok(!manifest.categories.includes('Extension Packs'));
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
