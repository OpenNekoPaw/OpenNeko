import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  assertMacOSReleaseMetadata,
  prepareMacOSReleaseArtifacts,
  resolveMacOSReleaseZip,
} from '../prepare-macos-release-artifacts.mjs';

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('macOS release artifacts', () => {
  it('requires the exact v-prefixed Desktop package version', () => {
    assert.deepEqual(assertMacOSReleaseMetadata({ tag: 'v1.2.3', version: '1.2.3' }), {
      tag: 'v1.2.3',
      version: '1.2.3',
    });
    assert.throws(
      () => assertMacOSReleaseMetadata({ tag: 'v1.2.4', version: '1.2.3' }),
      /macOS release tag mismatch: expected v1.2.3, received v1.2.4/u,
    );
    assert.throws(
      () => assertMacOSReleaseMetadata({ tag: '1.2.3', version: '1.2.3' }),
      /macOS release tag mismatch/u,
    );
  });

  it('accepts one exact versioned ZIP and writes its SHA-256 manifest', async () => {
    const repositoryRoot = await createRoot();
    const version = '1.2.3';
    const zipPath = resolveMacOSReleaseZip({ repositoryRoot, version });
    await mkdir(dirname(zipPath), { recursive: true });
    const bytes = Buffer.from('release-zip');
    await writeFile(zipPath, bytes);

    const result = prepareMacOSReleaseArtifacts({ repositoryRoot, version });
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual(result, {
      checksumPath: join(repositoryRoot, 'apps/neko-desktop/out/release/SHASUMS256.txt'),
      sha256: digest,
      zipPath,
    });
    assert.equal(
      await readFile(result.checksumPath, 'utf8'),
      `${digest}  OpenNeko-darwin-arm64-1.2.3.zip\n`,
    );
  });

  it('rejects missing, stale, or ambiguous ZIP output', async () => {
    const repositoryRoot = await createRoot();
    assert.throws(
      () => prepareMacOSReleaseArtifacts({ repositoryRoot, version: '1.2.3' }),
      /macOS release ZIP is missing/u,
    );

    const expected = resolveMacOSReleaseZip({ repositoryRoot, version: '1.2.3' });
    await mkdir(dirname(expected), { recursive: true });
    await writeFile(expected, 'expected');
    await writeFile(join(dirname(expected), 'OpenNeko-darwin-arm64-1.2.2.zip'), 'stale');
    assert.throws(
      () => prepareMacOSReleaseArtifacts({ repositoryRoot, version: '1.2.3' }),
      /macOS release ZIP set is ambiguous/u,
    );
  });
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-macos-release-'));
  roots.push(root);
  return root;
}
