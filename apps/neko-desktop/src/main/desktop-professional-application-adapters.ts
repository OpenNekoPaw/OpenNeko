import { execFile as executeFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import { promisify } from 'node:util';

import type {
  ProfessionalApplicationBinding,
  ProfessionalApplicationDiagnostic,
  ProfessionalApplicationInspection,
  ProfessionalApplicationOperation,
  ProfessionalApplicationProfile,
} from '@neko/professional-apps-contracts';
import type {
  ProfessionalApplicationContentAuthorizationPort,
  ProfessionalApplicationDiscoveryPort,
  ProfessionalApplicationLaunchPort,
} from '@neko/professional-apps-node';

const executeFileAsync = promisify(executeFile);
export interface DesktopProfessionalApplicationNativePort {
  findMacApplication(bundleId: string, signal?: AbortSignal): Promise<boolean>;
  readMacApplicationBundleId(applicationPath: string, signal?: AbortSignal): Promise<string>;
  openMacApplication(bundleId: string, launchNew: boolean, signal?: AbortSignal): Promise<void>;
}

export function createDesktopProfessionalApplicationNativePort(): DesktopProfessionalApplicationNativePort {
  return {
    async findMacApplication(bundleId, signal) {
      const result = await executeFileAsync(
        '/usr/bin/mdfind',
        [`kMDItemCFBundleIdentifier == '${requireBundleId(bundleId)}'`],
        { encoding: 'utf8', signal },
      );
      return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .some(Boolean);
    },
    async readMacApplicationBundleId(applicationPath, signal) {
      const selectedPath = requireMacApplicationPath(applicationPath);
      const selectedStat = await lstat(selectedPath);
      if (selectedStat.isSymbolicLink() || !selectedStat.isDirectory()) {
        throw new Error('Selected macOS application must be a direct application bundle.');
      }
      const canonicalPath = await realpath(selectedPath);
      if (extname(canonicalPath) !== '.app') {
        throw new Error('Selected macOS application is not an application bundle.');
      }
      const result = await executeFileAsync(
        '/usr/bin/mdls',
        ['-raw', '-name', 'kMDItemCFBundleIdentifier', canonicalPath],
        { encoding: 'utf8', signal },
      );
      return parseMacApplicationBundleId(result.stdout);
    },
    async openMacApplication(bundleId, launchNew, signal) {
      await executeFileAsync(
        '/usr/bin/open',
        [...(launchNew ? ['-n'] : []), '-b', requireBundleId(bundleId)],
        { signal },
      );
    },
  };
}

export class DesktopProfessionalApplicationAdapter
  implements ProfessionalApplicationDiscoveryPort, ProfessionalApplicationLaunchPort
{
  constructor(
    private readonly native: DesktopProfessionalApplicationNativePort,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async identifySelectedApplication(
    applicationPath: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.platform !== 'darwin') {
      throw new Error('Native application selection is only available for macOS applications.');
    }
    return this.native.readMacApplicationBundleId(applicationPath, signal);
  }

  async inspect(input: {
    readonly profile: ProfessionalApplicationProfile;
    readonly binding?: ProfessionalApplicationBinding;
    readonly signal?: AbortSignal;
  }): Promise<ProfessionalApplicationInspection> {
    if (input.profile.id !== 'comfyui') {
      throw new Error(`Desktop application adapter does not own '${input.profile.id}'.`);
    }
    const applicationIdentity = await this.findQualifiedApplication(input.profile, input.signal);
    const availableOperationIds = input.profile.operations.flatMap((operation) =>
      operation.transport === 'host' && operation.kind === 'launch' && applicationIdentity
        ? [operation.id]
        : [],
    );
    const diagnostics: ProfessionalApplicationDiagnostic[] = [];
    if (!applicationIdentity) {
      diagnostics.push({
        code: 'application-not-installed' as const,
        message: 'ComfyUI Desktop was not detected.',
      });
    }
    return {
      integrationId: input.profile.id,
      state:
        availableOperationIds.length > 0 ? 'ready' : applicationIdentity ? 'detected' : 'not-installed',
      ...(applicationIdentity ? { detectedApplicationIdentity: applicationIdentity } : {}),
      availableOperationIds,
      diagnostics,
    };
  }

  async launch(input: {
    readonly profile: ProfessionalApplicationProfile;
    readonly binding?: ProfessionalApplicationBinding;
    readonly operation: ProfessionalApplicationOperation;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly targetIdentity: string }> {
    if (input.operation.kind !== 'launch' || input.operation.transport !== 'host') {
      throw new Error(`Desktop launch adapter rejects operation '${input.operation.id}'.`);
    }
    const bundleId = input.profile.applicationIdentities.find(
      (identity) => identity.platform === 'macos' && identity.kind === 'bundle-id',
    )?.value;
    if (this.platform !== 'darwin' || !bundleId) {
      throw new Error(`Desktop launch for '${input.profile.id}' is unavailable on this platform.`);
    }
    await this.native.openMacApplication(
      bundleId,
      input.binding?.launchPreference === 'launch-new',
      input.signal,
    );
    return { targetIdentity: bundleId };
  }

  async transfer(): Promise<{ readonly targetIdentity: string; readonly accepted: boolean }> {
    throw new Error(
      'Professional application resource transfer is not registered for this launcher-only profile.',
    );
  }

  private async findQualifiedApplication(
    profile: ProfessionalApplicationProfile,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (this.platform !== 'darwin') return undefined;
    const bundleId = profile.applicationIdentities.find(
      (identity) => identity.platform === 'macos' && identity.kind === 'bundle-id',
    )?.value;
    if (!bundleId) return undefined;
    try {
      return (await this.native.findMacApplication(bundleId, signal)) ? bundleId : undefined;
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(`ComfyUI Desktop discovery failed: ${describeError(error)}`);
    }
  }
}

export class DesktopUnavailableProfessionalApplicationContentAuthorization implements ProfessionalApplicationContentAuthorizationPort {
  async authorize(): Promise<{ readonly authorizationId: string }> {
    throw new Error(
      'Professional application content authorization is unavailable until an owning resource service supplies the exact source.',
    );
  }
}

function requireBundleId(bundleId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/u.test(bundleId)) {
    throw new Error('Desktop application bundle identity is invalid.');
  }
  return bundleId;
}

function requireMacApplicationPath(applicationPath: string): string {
  if (
    !applicationPath ||
    applicationPath !== applicationPath.trim() ||
    !isAbsolute(applicationPath) ||
    extname(applicationPath) !== '.app'
  ) {
    throw new Error('Selected macOS application path is invalid.');
  }
  return applicationPath;
}

function parseMacApplicationBundleId(value: string): string {
  const raw = value.trim();
  if (!raw || raw === '(null)') {
    throw new Error('Selected macOS application does not expose a bundle identity.');
  }
  if (raw.startsWith('"')) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      throw new Error('Selected macOS application bundle identity is invalid.', { cause: error });
    }
    if (typeof decoded !== 'string') {
      throw new Error('Selected macOS application bundle identity is invalid.');
    }
    return requireBundleId(decoded);
  }
  return requireBundleId(raw);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
