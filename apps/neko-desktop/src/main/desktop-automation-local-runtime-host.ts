import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AutomationProviderOperation } from '@neko/automation-contracts';
import type {
  AutomationLocalRuntimeAssetKey,
  AutomationLocalRuntimeAssetProjection,
} from '@neko/automation-contracts/local-runtime-management';
import {
  BROWSER_USE_OBSERVE_PROFILE,
  CUA_DRIVER_OBSERVE_PROFILE,
  createAutomationLocalRuntimeManagementService,
  type AutomationLocalRuntimeHostInspection,
  type AutomationLocalRuntimeHostPort,
  type AutomationLocalRuntimeManagementService,
  type AutomationLocalRuntimeSourceDescriptor,
} from '@neko/automation-node';

export interface DesktopAutomationLocalRuntimeHost {
  readonly management: AutomationLocalRuntimeManagementService;
  resolve(sourceId: string, runtimeId: string): Promise<DesktopAutomationLocalRuntimeResolution>;
  dispose(): void;
}

export interface DesktopAutomationLocalRuntimeResolution {
  readonly sourceId: string;
  readonly runtimeId: string;
  readonly assets: Readonly<Partial<Record<AutomationLocalRuntimeAssetKey, string>>>;
}

interface AuthorizedAsset {
  readonly key: AutomationLocalRuntimeAssetKey;
  readonly runtimeId: string;
  readonly displayName: string;
  readonly hostPath: string;
}

interface AuthorizedRuntime {
  readonly sourceId: string;
  readonly runtimeId: string;
  readonly assets: Map<AutomationLocalRuntimeAssetKey, AuthorizedAsset>;
}

const DESKTOP_AUTOMATION_LOCAL_RUNTIME_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: 'browser-use.observe.local',
    displayName: 'Browser Use',
    profile: BROWSER_USE_OBSERVE_PROFILE,
    installationGuideUrl:
      'https://docs.browser-use.com/open-source/customize/integrations/mcp-server',
    installationCommand: "uvx --from 'browser-use[cli]' browser-use --mcp",
    assets: Object.freeze([
      Object.freeze({ key: 'provider-runtime', label: 'Browser Use runtime' }),
      Object.freeze({ key: 'browser-executable', label: 'Browser executable' }),
    ]),
    expectedServer: Object.freeze({ name: 'browser-use' }),
  }),
  Object.freeze({
    sourceId: 'computer-use.observe.local',
    displayName: 'Cua Driver',
    profile: CUA_DRIVER_OBSERVE_PROFILE,
    installationGuideUrl: 'https://cua.ai/docs/how-to-guides/driver/install',
    installationCommand: '/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"',
    assets: Object.freeze([Object.freeze({ key: 'provider-runtime', label: 'CuaDriver.app' })]),
    expectedServer: Object.freeze({ name: 'cua-driver' }),
  }),
] satisfies readonly AutomationLocalRuntimeSourceDescriptor[]);

export function createDesktopAutomationLocalRuntimeHost(options: {
  readonly selectAsset: (input: {
    readonly ownerId: string;
    readonly sourceId: string;
    readonly assetKey: AutomationLocalRuntimeAssetKey;
  }) => Promise<string | undefined>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly writeClipboardText: (text: string) => void;
  readonly assertDisconnectAllowed: (pluginId: string) => Promise<void>;
  readonly inspectProvider?: (
    input: DesktopAutomationLocalRuntimeResolution,
    signal?: AbortSignal,
  ) => Promise<{
    readonly server: { readonly name: string };
    readonly operations: readonly AutomationProviderOperation[];
  }>;
  readonly createIdentity?: () => string;
}): DesktopAutomationLocalRuntimeHost {
  const sources = new Map(
    DESKTOP_AUTOMATION_LOCAL_RUNTIME_SOURCES.map((source) => [source.sourceId, source]),
  );
  const authorizations = new Map<string, AuthorizedRuntime>();
  const createIdentity = options.createIdentity ?? randomUUID;
  let disposed = false;
  const requireActive = (): void => {
    if (disposed) throw new Error('Desktop Automation local runtime Host is disposed.');
  };

  const resolve = async (
    sourceId: string,
    runtimeId: string,
  ): Promise<DesktopAutomationLocalRuntimeResolution> => {
    requireActive();
    const source = requireSource(sources, sourceId);
    const authorization = authorizations.get(sourceId);
    if (!authorization || authorization.runtimeId !== runtimeId) {
      throw new Error('Desktop Automation local runtime authorization is unavailable or stale.');
    }
    const assets: Partial<Record<AutomationLocalRuntimeAssetKey, string>> = {};
    for (const expected of source.assets) {
      const asset = authorization.assets.get(expected.key);
      if (!asset) {
        throw new Error(`Desktop Automation local runtime asset '${expected.key}' is unavailable.`);
      }
      const current = await inspectAsset(asset);
      if (current.status !== 'valid') {
        throw new Error(
          `Desktop Automation local runtime asset '${expected.key}' is ${current.status}.`,
        );
      }
      assets[expected.key] = asset.hostPath;
    }
    return Object.freeze({ sourceId, runtimeId, assets: Object.freeze(assets) });
  };

  const hostPort: AutomationLocalRuntimeHostPort = {
    async inspect(sourceId, signal) {
      requireActive();
      const source = requireSource(sources, sourceId);
      const authorization = authorizations.get(sourceId);
      if (!authorization) return undefined;
      const assets = await Promise.all(
        source.assets.map(async (expected): Promise<AutomationLocalRuntimeAssetProjection> => {
          const asset = authorization.assets.get(expected.key);
          if (!asset) {
            return {
              ...expected,
              authorized: false,
              runtimeId: '',
              displayName: '',
              status: 'missing',
            };
          }
          return { ...expected, ...(await inspectAsset(asset)) };
        }),
      );
      const base: AutomationLocalRuntimeHostInspection = {
        runtimeId: authorization.runtimeId,
        assets: Object.freeze(assets),
      };
      if (assets.some((asset) => asset.status !== 'valid') || !options.inspectProvider) {
        return Object.freeze(base);
      }
      let provider;
      try {
        provider = await options.inspectProvider(
          await resolve(sourceId, authorization.runtimeId),
          signal,
        );
      } catch {
        if (signal?.aborted) throw signal.reason;
        return Object.freeze(base);
      }
      return Object.freeze({
        ...base,
        server: Object.freeze({ ...provider.server }),
        operations: Object.freeze(provider.operations.map((operation) => Object.freeze(operation))),
      });
    },

    async authorizeAsset(input) {
      requireActive();
      const source = requireSource(sources, input.sourceId);
      if (!source.assets.some((asset) => asset.key === input.assetKey)) {
        throw new Error(
          `Desktop Automation local runtime asset '${input.assetKey}' is unavailable for '${input.sourceId}'.`,
        );
      }
      const selected = await options.selectAsset(input);
      if (selected === undefined) return;
      const hostPath = await realpath(selected);
      const details = await stat(hostPath);
      if (!details.isFile() && !details.isDirectory()) {
        throw new Error(
          'Desktop Automation local runtime asset is not a file or application bundle.',
        );
      }
      const authorization =
        authorizations.get(input.sourceId) ??
        ({
          sourceId: input.sourceId,
          runtimeId: `local-runtime:${createIdentity()}`,
          assets: new Map<AutomationLocalRuntimeAssetKey, AuthorizedAsset>(),
        } satisfies AuthorizedRuntime);
      authorization.assets.set(input.assetKey, {
        key: input.assetKey,
        runtimeId: `local-runtime-asset:${createIdentity()}`,
        displayName: path.basename(hostPath),
        hostPath,
      });
      authorizations.set(input.sourceId, authorization);
    },

    async disconnect(input) {
      requireActive();
      const source = requireSource(sources, input.sourceId);
      const authorization = authorizations.get(input.sourceId);
      if (!authorization || authorization.runtimeId !== input.runtimeId) {
        throw new Error('Desktop Automation local runtime disconnect identity is stale.');
      }
      await options.assertDisconnectAllowed(source.profile.provider.extensionId);
      authorizations.delete(input.sourceId);
    },

    async openInstallationGuide(input) {
      requireActive();
      const source = requireSource(sources, input.sourceId);
      if (source.installationGuideUrl !== input.url) {
        throw new Error('Desktop Automation local runtime installation guide is not reviewed.');
      }
      await options.openExternal(source.installationGuideUrl);
    },

    async copyInstallationCommand(input) {
      requireActive();
      const source = requireSource(sources, input.sourceId);
      if (source.installationCommand !== input.command) {
        throw new Error('Desktop Automation local runtime installation command is invalid.');
      }
      options.writeClipboardText(source.installationCommand);
    },
  };

  const result: DesktopAutomationLocalRuntimeHost = {
    management: createAutomationLocalRuntimeManagementService({
      sources: DESKTOP_AUTOMATION_LOCAL_RUNTIME_SOURCES,
      host: Object.freeze(hostPort),
    }),
    resolve,
    dispose() {
      if (disposed) return;
      disposed = true;
      authorizations.clear();
    },
  };
  return Object.freeze(result);
}

async function inspectAsset(
  asset: AuthorizedAsset,
): Promise<Omit<AutomationLocalRuntimeAssetProjection, 'label' | 'key'>> {
  try {
    const currentPath = await realpath(asset.hostPath);
    if (currentPath !== asset.hostPath) {
      return projectAsset(asset, 'changed');
    }
    const details = await stat(currentPath);
    return projectAsset(asset, details.isFile() || details.isDirectory() ? 'valid' : 'invalid');
  } catch (error) {
    if (isMissing(error)) return projectAsset(asset, 'missing');
    return projectAsset(asset, 'invalid');
  }
}

function projectAsset(
  asset: AuthorizedAsset,
  status: AutomationLocalRuntimeAssetProjection['status'],
): Omit<AutomationLocalRuntimeAssetProjection, 'label' | 'key'> {
  return {
    authorized: true,
    runtimeId: asset.runtimeId,
    displayName: asset.displayName,
    status,
  };
}

function requireSource(
  sources: ReadonlyMap<string, AutomationLocalRuntimeSourceDescriptor>,
  sourceId: string,
): AutomationLocalRuntimeSourceDescriptor {
  const source = sources.get(sourceId);
  if (!source)
    throw new Error(`Desktop Automation local runtime source '${sourceId}' is unavailable.`);
  return source;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
