import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fingerprintDirectory } from '../../../../scripts/dsh-runtime-closure.mjs';
import { prepareDesktopDshRuntime } from './desktop-dsh-runtime-bootstrap';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop DSH runtime bootstrap', () => {
  it('prepares the exact runtime, writable profile, virtual cwd, and bounded environment', async () => {
    const runtimeRoot = await createRuntimeClosure();
    const userDataRoot = await createRoot('openneko-dsh-user-data-');
    const builtinSkillRoot = await createRoot('openneko-dsh-skills-');

    const prepared = await prepareDesktopDshRuntime({
      isPackaged: false,
      resourcesPath: userDataRoot,
      userDataRoot,
      builtinSkillRoot,
      providers: providerProjection({
        profilePatchEntries: [{ id: 'llm-pi-ai', config: { providers: {} } }],
        credentialEnvironment: { OPENNEKO_DSH_PROVIDER_CREDENTIAL_0: 'provider-secret' },
      }),
      environment: {
        NEKO_DSH_RUNTIME_ROOT: runtimeRoot,
        PATH: '/usr/bin:/bin',
        TMPDIR: '/tmp',
        LANG: 'en_US.UTF-8',
        SECRET: 'must-not-enter-dsh',
        ELECTRON_RUN_AS_NODE: '1',
      },
    });

    const canonicalUserData = await realpath(userDataRoot);
    expect(prepared.resource.runtimeRoot).toBe(await realpath(runtimeRoot));
    expect(prepared.workingDirectory).toBe(join(canonicalUserData, 'dsh', 'workspace'));
    expect(prepared.profile.sessionRoot).toBe(join(canonicalUserData, 'dsh', 'sessions'));
    expect(prepared.environment).toEqual({
      PATH: '/usr/bin:/bin',
      TMPDIR: '/tmp',
      LANG: 'en_US.UTF-8',
      DSH_HOME: join(canonicalUserData, 'dsh'),
      HOME: join(canonicalUserData, 'dsh'),
      DSH_TELEMETRY_DISABLED: '1',
      DSH_BUNDLED_SKILL_DIR: await realpath(builtinSkillRoot),
      OPENNEKO_DSH_PROVIDER_CREDENTIAL_0: 'provider-secret',
    });
    expect(prepared.environment).not.toHaveProperty('SECRET');
    expect(prepared.environment).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
  });

  it('fails before subprocess construction when the runtime closure is modified', async () => {
    const runtimeRoot = await createRuntimeClosure();
    const userDataRoot = await createRoot('openneko-dsh-user-data-');
    const builtinSkillRoot = await createRoot('openneko-dsh-skills-');
    await writeFile(
      join(runtimeRoot, 'payload', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      'modified',
    );

    await expect(
      prepareDesktopDshRuntime({
        isPackaged: false,
        resourcesPath: userDataRoot,
        userDataRoot,
        builtinSkillRoot,
        providers: providerProjection(),
        environment: { NEKO_DSH_RUNTIME_ROOT: runtimeRoot },
      }),
    ).rejects.toThrow(/checksum mismatch/u);
  });

  it('fails before subprocess construction when the official DSH bridge is missing', async () => {
    const runtimeRoot = await createRuntimeClosure();
    const userDataRoot = await createRoot('openneko-dsh-user-data-');
    const builtinSkillRoot = await createRoot('openneko-dsh-skills-');
    await rm(join(runtimeRoot, 'payload', 'lib', 'node_modules', '@neko', 'dsh-bridge'), {
      recursive: true,
    });

    await expect(
      prepareDesktopDshRuntime({
        isPackaged: false,
        resourcesPath: userDataRoot,
        userDataRoot,
        builtinSkillRoot,
        providers: providerProjection(),
        environment: { NEKO_DSH_RUNTIME_ROOT: runtimeRoot },
      }),
    ).rejects.toThrow(/fingerprint does not match/u);
  });

  it('contains no implicit handler, system runtime, or active Workspace fallback', async () => {
    const source = await readFile(
      new URL('./desktop-dsh-runtime-bootstrap.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('process.execPath');
    expect(source).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(source).not.toMatch(/activeWorkspace|currentWorkspace|recentWorkspace/u);
    expect(source).not.toMatch(/handlers\s*\?\?/u);
  });
});

function providerProjection(overrides?: {
  readonly profilePatchEntries?: readonly Readonly<Record<string, unknown>>[];
  readonly credentialEnvironment?: Readonly<Record<string, string>>;
}) {
  return {
    profilePatchEntries: overrides?.profilePatchEntries ?? [],
    credentialEnvironment: overrides?.credentialEnvironment ?? {},
    executionCatalog: { resolve: () => undefined },
    diagnostics: [],
  };
}

async function createRuntimeClosure(): Promise<string> {
  const root = await createRoot('openneko-dsh-runtime-');
  const payload = join(root, 'payload');
  const profileRoot = join(payload, 'dsh-home', 'profiles', 'openneko');
  const dshRoot = join(payload, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib');
  await mkdir(join(payload, 'bin'), { recursive: true });
  await mkdir(profileRoot, { recursive: true });
  await mkdir(dshRoot, { recursive: true });
  const files = {
    node: join(payload, 'bin', 'node'),
    dsh: join(dshRoot, 'bin.js'),
    manifest: join(profileRoot, 'package.json'),
    patch: join(profileRoot, 'cordis.patch.yml'),
    licenses: join(payload, 'THIRD_PARTY_LICENSES.json'),
  };
  await writeFile(files.node, 'node');
  await writeFile(files.dsh, 'dsh');
  await writeFile(files.manifest, `${JSON.stringify(canonicalProfileManifest(), null, 2)}\n`);
  await writeFile(files.patch, '[]\n');
  await writeFile(files.licenses, '[]\n');
  for (const packageName of officialPackages()) {
    const packageRoot = join(payload, 'lib', 'node_modules', ...packageName.split('/'));
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, 'package.json'),
      `${JSON.stringify({
        name: packageName,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      })}\n`,
    );
    await writeFile(join(packageRoot, 'cordis.patch.yml'), '[]\n');
  }
  const closure = fingerprintDirectory(payload);
  await writeFile(
    join(root, 'descriptor.json'),
    `${JSON.stringify(
      {
        target: 'darwin-arm64',
        node: {
          release: '24.13.0',
          executable: { file: 'payload/bin/node', sha256: await sha256(files.node) },
        },
        dsh: {
          release: '0.1.0-rc.7',
          entrypoint: {
            file: 'payload/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
            sha256: await sha256(files.dsh),
          },
        },
        profile: {
          name: 'openneko',
          manifest: {
            file: 'payload/dsh-home/profiles/openneko/package.json',
            sha256: await sha256(files.manifest),
          },
          patch: {
            file: 'payload/dsh-home/profiles/openneko/cordis.patch.yml',
            sha256: await sha256(files.patch),
          },
        },
        closure: { directory: 'payload', ...closure },
        licenses: {
          file: 'payload/THIRD_PARTY_LICENSES.json',
          sha256: await sha256(files.licenses),
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function canonicalProfileManifest(): object {
  return {
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
  };
}

function officialPackages(): readonly string[] {
  return [
    '@neko/dsh-bridge',
    '@neko/chara-dsh-plugin',
    '@neko/world-dsh-plugin',
    '@neko/generation-dsh-plugin',
    '@neko/canvas-dsh-plugin',
    '@neko/cut-dsh-plugin',
    '@neko/content-dsh-plugin',
  ];
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
