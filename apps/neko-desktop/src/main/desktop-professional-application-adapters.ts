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
  request(url: string, signal?: AbortSignal): Promise<Response>;
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
    request(url, signal) {
      return fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(3_000)])
          : AbortSignal.timeout(3_000),
      });
    },
  };
}

export class DesktopProfessionalApplicationAdapter
  implements ProfessionalApplicationDiscoveryPort, ProfessionalApplicationLaunchPort
{
  constructor(
    private readonly native: DesktopProfessionalApplicationNativePort,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly capabilities: { readonly comfyUiApiExecution: boolean } = {
      comfyUiApiExecution: false,
    },
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
    const api = input.binding?.endpoint
      ? await this.inspectComfyUiEndpoint(input.binding.endpoint, input.signal)
      : { ready: false as const, diagnostics: [] as const };
    const availableOperationIds = input.profile.operations.flatMap((operation) =>
      supportsOperation(
        operation,
        Boolean(applicationIdentity),
        api.ready,
        this.capabilities.comfyUiApiExecution,
      )
        ? [operation.id]
        : [],
    );
    const diagnostics: ProfessionalApplicationDiagnostic[] = [...api.diagnostics];
    if (!applicationIdentity && !api.ready) {
      diagnostics.push({
        code: 'application-not-installed' as const,
        message: input.binding?.endpoint
          ? 'ComfyUI Desktop was not detected and the configured local endpoint is unavailable.'
          : 'ComfyUI Desktop was not detected. Configure a loopback endpoint or install the qualified Desktop application.',
      });
    }
    return {
      integrationId: input.profile.id,
      state:
        availableOperationIds.length > 0
          ? 'ready'
          : applicationIdentity || api.ready
            ? 'detected'
            : input.binding?.endpoint
              ? 'unavailable'
              : 'not-installed',
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
      'Professional application resource transfer is not registered until the authorized ComfyUI upload path is available.',
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

  private async inspectComfyUiEndpoint(
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly ready: boolean;
    readonly diagnostics: readonly {
      readonly code: 'endpoint-unavailable' | 'endpoint-outside-loopback';
      readonly message: string;
    }[];
  }> {
    const base = requireLoopbackEndpoint(endpoint);
    let response: Response;
    try {
      response = await this.native.request(`${base}/system_stats`, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ready: false,
        diagnostics: [
          {
            code: 'endpoint-unavailable',
            message: `ComfyUI local API is unavailable: ${describeError(error)}`,
          },
        ],
      };
    }
    if (response.type === 'opaqueredirect' || response.status >= 300 || response.status < 200) {
      return {
        ready: false,
        diagnostics: [
          {
            code:
              response.status >= 300 && response.status < 400
                ? 'endpoint-outside-loopback'
                : 'endpoint-unavailable',
            message: `ComfyUI local API readiness failed with HTTP ${response.status}.`,
          },
        ],
      };
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        ready: false,
        diagnostics: [
          {
            code: 'endpoint-unavailable',
            message: 'ComfyUI local API returned an invalid system_stats response.',
          },
        ],
      };
    }
    return { ready: true, diagnostics: [] };
  }
}

export class DesktopUnavailableProfessionalApplicationContentAuthorization implements ProfessionalApplicationContentAuthorizationPort {
  async authorize(): Promise<{ readonly authorizationId: string }> {
    throw new Error(
      'Professional application content authorization is unavailable until an owning resource service supplies the exact source.',
    );
  }
}

function supportsOperation(
  operation: ProfessionalApplicationOperation,
  applicationReady: boolean,
  apiReady: boolean,
  apiExecutionComposed: boolean,
): boolean {
  if (operation.transport === 'host' && operation.kind === 'launch') return applicationReady;
  return operation.transport === 'api' && apiReady && apiExecutionComposed;
}

function requireLoopbackEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('ComfyUI endpoint must remain on an explicit HTTP loopback host.');
  }
  return url.href.replace(/\/$/u, '');
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
