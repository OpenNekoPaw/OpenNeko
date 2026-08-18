import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeDesktopDshProfile } from './desktop-dsh-profile-materializer';
import type { DesktopDshRuntimeResource } from './desktop-dsh-runtime-resource';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop DSH profile materializer', () => {
  it('materializes only the official profile and preserves DSH-owned durable data', async () => {
    const fixture = await createFixture();
    const sessionFile = join(fixture.userDataRoot, 'dsh', 'sessions', 'workspace', 'session.jsonl');
    const settingsFile = join(fixture.userDataRoot, 'dsh', 'settings.yaml');
    const injectedProfileRoot = join(
      fixture.userDataRoot,
      'dsh',
      'profiles',
      fixture.runtime.profileName,
    );
    await mkdir(join(injectedProfileRoot, 'node_modules', 'untrusted'), { recursive: true });
    await mkdir(join(sessionFile, '..'), { recursive: true });
    await writeFile(sessionFile, 'session-authority\n');
    await writeFile(settingsFile, 'owned-by-dsh\n');
    await writeFile(join(injectedProfileRoot, 'package.json'), '{"dependencies":{"bad":"*"}}\n');
    await writeFile(join(injectedProfileRoot, 'cordis.yml'), 'injected runtime\n');
    await writeFile(join(fixture.userDataRoot, 'dsh', 'cordis.patch.yml'), 'injected patch\n');

    const result = await materializeDesktopDshProfile(fixture);

    expect(result).toEqual({
      dshHome: join(fixture.userDataRoot, 'dsh'),
      profileRoot: injectedProfileRoot,
      sessionRoot: join(fixture.userDataRoot, 'dsh', 'sessions'),
      environment: {
        DSH_HOME: join(fixture.userDataRoot, 'dsh'),
        HOME: join(fixture.userDataRoot, 'dsh'),
        DSH_TELEMETRY_DISABLED: '1',
      },
    });
    expect(await readFile(sessionFile, 'utf8')).toBe('session-authority\n');
    expect(await readFile(settingsFile, 'utf8')).toBe('owned-by-dsh\n');
    expect(await readFile(join(fixture.userDataRoot, 'dsh', 'cordis.patch.yml'), 'utf8')).toBe(
      '[]\n',
    );
    await expect(lstat(join(injectedProfileRoot, 'cordis.yml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      lstat(join(injectedProfileRoot, 'node_modules', 'untrusted')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(join(injectedProfileRoot, 'package.json'), 'utf8'))).toEqual(
      canonicalProfileManifest(),
    );
    await expectOfficialLinks(fixture.runtime.runtimeRoot, injectedProfileRoot);
  });

  it('restores the canonical profile on every launch without touching sibling profile state', async () => {
    const fixture = await createFixture();
    const sibling = join(fixture.userDataRoot, 'dsh', 'profiles', 'sibling', 'state.json');
    await mkdir(join(sibling, '..'), { recursive: true });
    await writeFile(sibling, 'sibling\n');
    const first = await materializeDesktopDshProfile(fixture);
    await writeFile(join(first.profileRoot, 'cordis.yml'), 'written by DSH\n');
    await writeFile(join(first.profileRoot, 'cordis.patch.yml'), 'injected after first launch\n');

    const second = await materializeDesktopDshProfile(fixture);

    expect(second.profileRoot).toBe(first.profileRoot);
    expect(await readFile(sibling, 'utf8')).toBe('sibling\n');
    expect(await readFile(join(second.profileRoot, 'cordis.patch.yml'), 'utf8')).toBe('[]\n');
    await expect(lstat(join(second.profileRoot, 'cordis.yml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expectOfficialLinks(fixture.runtime.runtimeRoot, second.profileRoot);
  });

  it('rejects an invalid template before modifying the writable DSH home', async () => {
    const fixture = await createFixture();
    const sentinel = join(fixture.userDataRoot, 'dsh', 'sessions', 'sentinel.jsonl');
    await mkdir(join(sentinel, '..'), { recursive: true });
    await writeFile(sentinel, 'unchanged\n');
    await writeFile(
      join(
        fixture.runtime.profileTemplateRoot,
        'profiles',
        fixture.runtime.profileName,
        'package.json',
      ),
      `${JSON.stringify({ ...canonicalProfileManifest(), dependencies: { injected: '*' } })}\n`,
    );

    await expect(materializeDesktopDshProfile(fixture)).rejects.toThrow(
      /profile manifest is not canonical/u,
    );
    expect(await readFile(sentinel, 'utf8')).toBe('unchanged\n');
    await expect(
      lstat(join(fixture.userDataRoot, 'dsh', 'profiles', fixture.runtime.profileName)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symlink in place of the writable profile root', async () => {
    const fixture = await createFixture();
    const profileRoot = join(fixture.userDataRoot, 'dsh', 'profiles', fixture.runtime.profileName);
    const external = await createRoot('openneko-external-profile-');
    await mkdir(join(profileRoot, '..'), { recursive: true });
    await symlink(external, profileRoot, 'dir');

    await expect(materializeDesktopDshProfile(fixture)).rejects.toThrow(
      /profile root must be a real directory/u,
    );
    expect((await lstat(profileRoot)).isSymbolicLink()).toBe(true);
  });

  it('restores the previous profile when the home patch cannot be replaced', async () => {
    const fixture = await createFixture();
    const profileRoot = join(fixture.userDataRoot, 'dsh', 'profiles', fixture.runtime.profileName);
    const previousManifest = '{"previous":true}\n';
    await mkdir(profileRoot, { recursive: true });
    await writeFile(join(profileRoot, 'package.json'), previousManifest);
    await mkdir(join(fixture.userDataRoot, 'dsh', 'cordis.patch.yml'), { recursive: true });

    await expect(materializeDesktopDshProfile(fixture)).rejects.toThrow(
      /home patch must be a real file/u,
    );
    expect(await readFile(join(profileRoot, 'package.json'), 'utf8')).toBe(previousManifest);
    expect((await lstat(join(fixture.userDataRoot, 'dsh', 'cordis.patch.yml'))).isDirectory()).toBe(
      true,
    );
  });
});

async function createFixture(): Promise<{
  readonly userDataRoot: string;
  readonly runtime: DesktopDshRuntimeResource;
}> {
  const userDataRoot = await realpath(await createRoot('openneko-dsh-user-data-'));
  const runtimeRoot = await realpath(await createRoot('openneko-dsh-runtime-'));
  const profileTemplateRoot = join(runtimeRoot, 'payload', 'dsh-home');
  const profileRoot = join(profileTemplateRoot, 'profiles', 'openneko');
  await mkdir(profileRoot, { recursive: true });
  await writeFile(
    join(profileRoot, 'package.json'),
    `${JSON.stringify(canonicalProfileManifest(), null, 2)}\n`,
  );
  await writeFile(join(profileRoot, 'cordis.patch.yml'), '[]\n');
  for (const packageName of officialPackages()) {
    const packageRoot = join(
      runtimeRoot,
      'payload',
      'lib',
      'node_modules',
      ...packageName.split('/'),
    );
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
  return {
    userDataRoot,
    runtime: {
      runtimeRoot,
      executable: join(runtimeRoot, 'payload', 'bin', 'node'),
      args: [],
      profileName: 'openneko',
      profileTemplateRoot,
    },
  };
}

async function expectOfficialLinks(runtimeRoot: string, profileRoot: string): Promise<void> {
  for (const packageName of officialPackages()) {
    const link = join(profileRoot, 'node_modules', packageName);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(
      join(runtimeRoot, 'payload', 'lib', 'node_modules', ...packageName.split('/')),
    );
  }
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
          '@neko/generation-dsh-plugin',
          '@neko/canvas-dsh-plugin',
          '@neko/cut-dsh-plugin',
        ],
      },
    },
  };
}

function officialPackages(): readonly string[] {
  return [
    '@neko/dsh-bridge',
    '@neko/generation-dsh-plugin',
    '@neko/canvas-dsh-plugin',
    '@neko/cut-dsh-plugin',
  ];
}

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
