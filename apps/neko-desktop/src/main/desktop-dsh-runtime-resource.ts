import { realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { assertDshRuntimeDirectory } from '../../../../scripts/dsh-runtime-closure.mjs';

const DESKTOP_DSH_TARGET = 'darwin-arm64';

export interface DesktopDshRuntimeResource {
  readonly runtimeRoot: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly profileName: string;
  readonly profileTemplateRoot: string;
}

export function resolveDesktopDshRuntimeResource(options: {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}): DesktopDshRuntimeResource {
  if (!isAbsolute(options.resourcesPath)) {
    throw new Error('Desktop resources path must be absolute.');
  }
  const configuredRuntimeRoot = options.isPackaged
    ? join(options.resourcesPath, 'dsh-runtime', DESKTOP_DSH_TARGET)
    : requireDevelopmentRuntimeRoot(options.environment['NEKO_DSH_RUNTIME_ROOT']);
  const runtimeRoot = realpathSync(configuredRuntimeRoot);
  const verified = assertDshRuntimeDirectory(runtimeRoot, DESKTOP_DSH_TARGET, {
    verifyTree: true,
  });
  return Object.freeze({
    runtimeRoot,
    executable: verified.node,
    args: Object.freeze([
      verified.dshEntrypoint,
      '--profile',
      verified.descriptor.profile.name,
    ]),
    profileName: verified.descriptor.profile.name,
    profileTemplateRoot: join(runtimeRoot, 'payload', 'dsh-home'),
  });
}

function requireDevelopmentRuntimeRoot(value: string | undefined): string {
  if (value === undefined || !isAbsolute(value)) {
    throw new Error(
      'Desktop development requires an absolute NEKO_DSH_RUNTIME_ROOT; system Node and global dsh are not product runtimes.',
    );
  }
  return value;
}
