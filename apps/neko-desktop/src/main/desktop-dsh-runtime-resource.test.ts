import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fingerprintDirectory } from '../../../../scripts/dsh-runtime-closure.mjs';
import { resolveDesktopDshRuntimeResource } from './desktop-dsh-runtime-resource';

describe('Desktop DSH runtime resource', () => {
  it('resolves only the verified packaged resource and ignores development overrides', () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'openneko-dsh-resources-'));
    const runtimeRoot = join(resourcesPath, 'dsh-runtime', 'darwin-arm64');
    createFixtureRuntime(runtimeRoot);
    const canonicalRuntimeRoot = realpathSync(runtimeRoot);

    const resolved = resolveDesktopDshRuntimeResource({
      isPackaged: true,
      resourcesPath,
      environment: { NEKO_DSH_RUNTIME_ROOT: '/must/not/participate' },
    });

    expect(resolved).toEqual({
      runtimeRoot: canonicalRuntimeRoot,
      executable: join(canonicalRuntimeRoot, 'payload', 'bin', 'node'),
      args: [
        join(
          canonicalRuntimeRoot,
          'payload',
          'lib',
          'node_modules',
          '@deepseek-ai',
          'dsh',
          'lib',
          'bin.js',
        ),
        '--profile',
        'openneko',
      ],
      profileName: 'openneko',
      profileTemplateRoot: join(canonicalRuntimeRoot, 'payload', 'dsh-home'),
    });
  });

  it('requires one explicit absolute development runtime root', () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'openneko-dsh-resources-'));

    for (const environment of [{}, { NEKO_DSH_RUNTIME_ROOT: 'relative/runtime' }]) {
      expect(() =>
        resolveDesktopDshRuntimeResource({
          isPackaged: false,
          resourcesPath,
          environment,
        }),
      ).toThrow(/requires an absolute NEKO_DSH_RUNTIME_ROOT/u);
    }
  });

  it('fails when the declared runtime payload is modified', () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'openneko-dsh-resources-'));
    const runtimeRoot = join(resourcesPath, 'dsh-runtime', 'darwin-arm64');
    const files = createFixtureRuntime(runtimeRoot);
    writeFileSync(files.dsh, 'modified');

    expect(() =>
      resolveDesktopDshRuntimeResource({
        isPackaged: true,
        resourcesPath,
        environment: {},
      }),
    ).toThrow(/checksum mismatch/u);
  });

  it('contains no Electron-as-Node or PATH-based runtime fallback', () => {
    const source = readFileSync(
      new URL('./desktop-dsh-runtime-resource.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('process.execPath');
    expect(source).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(source).not.toMatch(/\b(?:which|where)\s+dsh\b/u);
    expect(source).not.toMatch(/(?:^|["'`])(?:node|dsh)(?:["'`]|$)/mu);
  });
});

function createFixtureRuntime(root: string): {
  readonly dsh: string;
} {
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
  writeFileSync(
    join(root, 'descriptor.json'),
    `${JSON.stringify(
      {
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
      },
      null,
      2,
    )}\n`,
  );
  return files;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
