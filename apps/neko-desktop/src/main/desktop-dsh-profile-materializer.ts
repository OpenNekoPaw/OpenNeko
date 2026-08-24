import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import type { DesktopDshRuntimeResource } from './desktop-dsh-runtime-resource';

const OPENNEKO_PROFILE_BUNDLES = Object.freeze([
  '@deepseek-ai/dsh-base',
  '@neko/dsh-bridge',
  '@neko/agent-dsh-plugin',
  '@neko/chara-dsh-plugin',
  '@neko/world-dsh-plugin',
  '@neko/generation-dsh-plugin',
  '@neko/canvas-dsh-plugin',
  '@neko/cut-dsh-plugin',
  '@neko/content-dsh-plugin',
]);
const OPENNEKO_PACKAGES = Object.freeze([
  '@neko/dsh-bridge',
  '@neko/agent-dsh-plugin',
  '@neko/chara-dsh-plugin',
  '@neko/world-dsh-plugin',
  '@neko/generation-dsh-plugin',
  '@neko/canvas-dsh-plugin',
  '@neko/cut-dsh-plugin',
  '@neko/content-dsh-plugin',
]);
const EMPTY_DSH_PATCH = '[]\n';

export interface DesktopDshProfileMaterialization {
  readonly dshHome: string;
  readonly profileRoot: string;
  readonly sessionRoot: string;
  readonly environment: Readonly<Record<string, string>>;
}

export async function materializeDesktopDshProfile(options: {
  readonly userDataRoot: string;
  readonly runtime: DesktopDshRuntimeResource;
  readonly profilePatchEntries: readonly Readonly<Record<string, unknown>>[];
}): Promise<DesktopDshProfileMaterialization> {
  if (!isAbsolute(options.userDataRoot)) {
    throw new Error('Desktop DSH userData root must be absolute.');
  }
  const userDataRoot = await realpath(options.userDataRoot);
  const runtimeRoot = await realpath(options.runtime.runtimeRoot);
  const profileTemplateRoot = await realpath(options.runtime.profileTemplateRoot);
  assertContained(runtimeRoot, profileTemplateRoot, 'profile template');

  const templateProfileRoot = join(profileTemplateRoot, 'profiles', options.runtime.profileName);
  const manifest = await readCanonicalProfileManifest(join(templateProfileRoot, 'package.json'));
  await assertCanonicalTemplatePatch(join(templateProfileRoot, 'cordis.patch.yml'));
  const patch = `${JSON.stringify(options.profilePatchEntries, null, 2)}\n`;
  const packageTargets = await resolveOfficialPackageTargets(runtimeRoot);

  const dshHome = join(userDataRoot, 'dsh');
  const profilesRoot = join(dshHome, 'profiles');
  const profileRoot = join(profilesRoot, options.runtime.profileName);
  const operationId = randomUUID();
  const stagingRoot = join(profilesRoot, `.openneko-staging-${operationId}`);
  const replacedRoot = join(profilesRoot, `.openneko-replaced-${operationId}`);
  const homePatch = join(dshHome, 'cordis.patch.yml');
  const homePatchTemporary = join(dshHome, `.openneko-home-patch-${operationId}`);
  const replacedHomePatch = join(dshHome, `.openneko-replaced-home-patch-${operationId}`);
  await mkdir(profilesRoot, { recursive: true });

  let previousProfileMoved = false;
  let previousHomePatchMoved = false;
  let stagedProfileInstalled = false;
  let homePatchInstalled = false;
  try {
    await mkdir(join(stagingRoot, 'node_modules', '@neko'), { recursive: true });
    await writeFile(join(stagingRoot, 'package.json'), manifest, { encoding: 'utf8', flag: 'wx' });
    await writeFile(join(stagingRoot, 'cordis.patch.yml'), patch, {
      encoding: 'utf8',
      flag: 'wx',
    });
    for (const [packageName, target] of packageTargets) {
      await symlink(target, join(stagingRoot, 'node_modules', packageName), 'dir');
    }
    await writeFile(homePatchTemporary, EMPTY_DSH_PATCH, { encoding: 'utf8', flag: 'wx' });
    previousProfileMoved = await moveCurrentProfile(profileRoot, replacedRoot);
    previousHomePatchMoved = await moveCurrentFile(homePatch, replacedHomePatch);
    await rename(stagingRoot, profileRoot);
    stagedProfileInstalled = true;
    await rename(homePatchTemporary, homePatch);
    homePatchInstalled = true;
    if (previousProfileMoved) await rm(replacedRoot, { recursive: true, force: false });
    if (previousHomePatchMoved) await rm(replacedHomePatch, { force: false });
  } catch (error) {
    const cleanupErrors: unknown[] = [error];
    try {
      if (stagedProfileInstalled) await rm(profileRoot, { recursive: true, force: false });
      if (previousProfileMoved) await rename(replacedRoot, profileRoot);
      if (homePatchInstalled) await rm(homePatch, { force: false });
      if (previousHomePatchMoved) await rename(replacedHomePatch, homePatch);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    await Promise.all([
      rm(stagingRoot, { recursive: true, force: true }),
      rm(homePatchTemporary, { force: true }),
      rm(replacedHomePatch, { force: true }),
    ]);
    if (cleanupErrors.length > 1) {
      throw new AggregateError(
        cleanupErrors,
        'Desktop DSH profile materialization failed and its previous profile could not be restored.',
      );
    }
    throw error;
  }

  return Object.freeze({
    dshHome,
    profileRoot,
    sessionRoot: join(dshHome, 'sessions'),
    environment: Object.freeze({
      DSH_HOME: dshHome,
      HOME: dshHome,
      DSH_TELEMETRY_DISABLED: '1',
    }),
  });
}

async function assertCanonicalTemplatePatch(path: string): Promise<void> {
  const source = await readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error('Packaged OpenNeko DSH profile patch is not canonical JSON.', { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length !== 0) {
    throw new Error('Packaged OpenNeko DSH profile patch must be the canonical empty template.');
  }
}

async function moveCurrentFile(path: string, replacement: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error('Writable DSH home patch must be a real file.');
    }
    await rename(path, replacement);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function readCanonicalProfileManifest(path: string): Promise<string> {
  const source = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(source);
  if (
    !isRecordWithExactKeys(parsed, ['name', 'private', 'dsh']) ||
    parsed.name !== 'openneko-dsh-profile' ||
    parsed.private !== true ||
    !isRecordWithExactKeys(parsed.dsh, ['profile']) ||
    !isRecordWithExactKeys(parsed.dsh.profile, ['bundles']) ||
    !Array.isArray(parsed.dsh.profile.bundles) ||
    JSON.stringify(parsed.dsh.profile.bundles) !== JSON.stringify(OPENNEKO_PROFILE_BUNDLES)
  ) {
    throw new Error('Packaged OpenNeko DSH profile manifest is not canonical.');
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

async function resolveOfficialPackageTargets(
  runtimeRoot: string,
): Promise<ReadonlyMap<string, string>> {
  const targets = new Map<string, string>();
  for (const packageName of OPENNEKO_PACKAGES) {
    const target = await realpath(
      join(runtimeRoot, 'payload', 'lib', 'node_modules', ...packageName.split('/')),
    );
    assertContained(runtimeRoot, target, packageName);
    const stats = await lstat(target);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Packaged DSH contribution is not a real directory: ${packageName}.`);
    }
    const manifest: unknown = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    if (
      !isRecord(manifest) ||
      manifest.name !== packageName ||
      !isRecord(manifest.dsh) ||
      !isRecord(manifest.dsh.bundle) ||
      manifest.dsh.bundle.patch !== './cordis.patch.yml'
    ) {
      throw new Error(`Packaged DSH contribution manifest is invalid: ${packageName}.`);
    }
    targets.set(packageName, target);
  }
  return targets;
}

async function moveCurrentProfile(profileRoot: string, replacedRoot: string): Promise<boolean> {
  try {
    const stats = await lstat(profileRoot);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('Writable OpenNeko DSH profile root must be a real directory.');
    }
    await rename(profileRoot, replacedRoot);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function assertContained(root: string, target: string, label: string): void {
  const child = relative(root, target);
  if (child.length === 0 || child.startsWith('..') || isAbsolute(child)) {
    throw new Error(`Packaged DSH ${label} must remain inside the verified runtime root.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordWithExactKeys<TKeys extends string>(
  value: unknown,
  keys: readonly TKeys[],
): value is Record<TKeys, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
