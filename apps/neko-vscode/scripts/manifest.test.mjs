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
  'neko-cut',
  'neko-canvas',
  'neko-agent',
  'neko-assets',
];

test('extension pack contains exactly the retained release extensions', () => {
  assert.deepEqual(groups.packages.buildRelease, retainedReleaseExtensions);

  const expected = retainedReleaseExtensions.map((name) => `neko.${name}`);
  assert.deepEqual(manifest.extensionPack, expected);
  assert.equal(new Set(manifest.extensionPack).size, manifest.extensionPack.length);
});

test('extension pack remains a pure manifest without runtime activation', () => {
  assert.equal(manifest.displayName, 'OpenNeko');
  assert.equal(manifest.name, 'neko-suite');
  assert.equal(manifest.publisher, 'neko');
  assert.equal(manifest.main, undefined);
  assert.equal(manifest.browser, undefined);
  assert.equal(manifest.activationEvents, undefined);
  assert.equal(manifest.contributes, undefined);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
