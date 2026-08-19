import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  assertDshRuntimeDirectory,
  fingerprintDirectory,
  stagePackagedDshRuntime,
} from '../dsh-runtime-closure.mjs';

describe('OpenNeko DSH runtime closure', () => {
  it('verifies the canonical payload and complete dependency tree fingerprint', () => {
    const root = createFixtureRuntime();
    const resolved = assertDshRuntimeDirectory(root, 'darwin-arm64', { verifyTree: true });
    assert.equal(resolved.descriptor.dsh.release, '0.1.0-rc.7');

    writeFileSync(resolved.dshEntrypoint, 'modified');
    assert.throws(
      () => assertDshRuntimeDirectory(root, 'darwin-arm64', { verifyTree: true }),
      /checksum mismatch/u,
    );
  });

  it('requires an explicit verified closure for packaged staging', () => {
    const stageRoot = mkdtempSync(join(tmpdir(), 'openneko-dsh-stage-'));
    assert.throws(
      () => stagePackagedDshRuntime(stageRoot, 'darwin-arm64', undefined),
      /requires NEKO_DSH_RUNTIME_ROOT/u,
    );
  });

  it('rejects symlinks anywhere in the payload tree', () => {
    const root = createFixtureRuntime();
    symlinkSync(
      join(root, 'payload', 'bin', 'node'),
      join(root, 'payload', 'bin', 'node-link'),
    );
    assert.throws(() => fingerprintDirectory(join(root, 'payload')), /must not contain symlinks/u);
  });

  it('rejects an unknown descriptor field and non-canonical entrypoint', () => {
    const root = createFixtureRuntime();
    const descriptor = readDescriptor(root);
    writeDescriptor(root, { ...descriptor, unexpected: true });
    assert.throws(() => assertDshRuntimeDirectory(root, 'darwin-arm64'), /descriptor is invalid/u);

    delete descriptor.unexpected;
    descriptor.dsh.entrypoint.file = 'payload/bin/dsh.js';
    writeDescriptor(root, descriptor);
    assert.throws(() => assertDshRuntimeDirectory(root, 'darwin-arm64'), /canonical packaged layout/u);
  });
});

function createFixtureRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'openneko-dsh-runtime-'));
  const payload = join(root, 'payload');
  const profile = join(payload, 'dsh-home', 'profiles', 'openneko');
  const dshRoot = join(payload, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib');
  mkdirSync(join(payload, 'bin'), { recursive: true });
  mkdirSync(profile, { recursive: true });
  mkdirSync(dshRoot, { recursive: true });
  const files = {
    node: join(payload, 'bin', 'node'),
    dsh: join(dshRoot, 'bin.js'),
    manifest: join(profile, 'package.json'),
    patch: join(profile, 'cordis.patch.yml'),
    licenses: join(payload, 'THIRD_PARTY_LICENSES.json'),
  };
  writeFileSync(files.node, 'node');
  writeFileSync(files.dsh, 'dsh');
  writeFileSync(
    files.manifest,
    JSON.stringify({
      name: 'openneko-dsh-profile',
      private: true,
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@neko/dsh-bridge',
            '@neko/chara-dsh-plugin',
            '@neko/world-dsh-plugin',
            '@neko/generation-dsh-plugin',
            '@neko/canvas-dsh-plugin',
            '@neko/cut-dsh-plugin',
            '@neko/content-dsh-plugin',
          ],
        },
      },
    }),
  );
  writeFileSync(files.patch, '[]\n');
  writeFileSync(files.licenses, '[]\n');
  const closure = fingerprintDirectory(payload);
  writeDescriptor(root, {
    target: 'darwin-arm64',
    node: {
      release: '24.13.0',
      executable: { file: 'payload/bin/node', sha256: sha256(files.node) },
    },
    dsh: {
      release: '0.1.0-rc.7',
      entrypoint: {
        file: 'payload/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
        sha256: sha256(files.dsh),
      },
    },
    profile: {
      name: 'openneko',
      manifest: {
        file: 'payload/dsh-home/profiles/openneko/package.json',
        sha256: sha256(files.manifest),
      },
      patch: {
        file: 'payload/dsh-home/profiles/openneko/cordis.patch.yml',
        sha256: sha256(files.patch),
      },
    },
    closure: { directory: 'payload', ...closure },
    licenses: {
      file: 'payload/THIRD_PARTY_LICENSES.json',
      sha256: sha256(files.licenses),
    },
  });
  return root;
}

function readDescriptor(root) {
  return JSON.parse(readFileSync(join(root, 'descriptor.json'), 'utf8'));
}

function writeDescriptor(root, descriptor) {
  writeFileSync(join(root, 'descriptor.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
