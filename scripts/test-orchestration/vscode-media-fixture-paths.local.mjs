import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isOwnedFixtureMarker,
  MEDIA_FIXTURE_RELATIVE_ROOT,
  resolveMediaFixtureLayout,
} from '../prepare-vscode-media-fixture.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('media fixture resolves only below the canonical neko-test workspace', () => {
  const layout = resolveMediaFixtureLayout('/Users/tester');

  assert.equal(layout.workspaceRoot, '/Users/tester/Git/neko-test');
  assert.equal(
    layout.fixtureRoot,
    '/Users/tester/Git/neko-test/.neko/.functional/media-runtime',
  );
});

test('media fixture replacement requires the exact ownership marker', () => {
  assert.equal(
    isOwnedFixtureMarker({
      schemaVersion: 1,
      kind: 'openneko-vscode-media-runtime',
      workspaceRoot: '${HOME}/Git/neko-test',
      workspaceRelativeRoot: MEDIA_FIXTURE_RELATIVE_ROOT,
    }),
    true,
  );
  assert.equal(
    isOwnedFixtureMarker({
      schemaVersion: 1,
      kind: 'openneko-vscode-media-runtime',
      workspaceRoot: '${HOME}/Git/another-workspace',
      workspaceRelativeRoot: MEDIA_FIXTURE_RELATIVE_ROOT,
    }),
    false,
  );
  assert.equal(isOwnedFixtureMarker(undefined), false);
});

test('synthetic video generation requires VideoToolbox without software fallback', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../prepare-vscode-media-fixture.mjs', import.meta.url)),
    'utf8',
  );

  assert.match(source, /'h264_videotoolbox'/);
  assert.match(source, /'-allow_sw',\s*'0'/);
  assert.doesNotMatch(source, /libx264/);
});
