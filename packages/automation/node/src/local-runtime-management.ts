import {
  parseAutomationProfile,
  parseAutomationProviderInspection,
  type AutomationProfile,
  type AutomationProviderOperation,
} from '@neko/automation-contracts';
import type {
  AutomationLocalRuntimeAssetKey,
  AutomationLocalRuntimeAssetProjection,
  AutomationLocalRuntimeDiagnosticCode,
  AutomationLocalRuntimeProjection,
} from '@neko/automation-contracts/local-runtime-management';
import { inspectAutomationProviderSupport } from './provider-support';

export interface AutomationLocalRuntimeSourceDescriptor {
  readonly sourceId: string;
  readonly displayName: string;
  readonly profile: AutomationProfile;
  readonly installationGuideUrl: string;
  readonly installationCommand: string;
  readonly assets: readonly {
    readonly key: AutomationLocalRuntimeAssetKey;
    readonly label: string;
  }[];
  readonly expectedServer: {
    readonly name: string;
  };
}

export interface AutomationLocalRuntimeHostInspection {
  readonly runtimeId: string;
  readonly assets: readonly AutomationLocalRuntimeAssetProjection[];
  readonly server?: {
    readonly name: string;
  };
  readonly operations?: readonly AutomationProviderOperation[];
}

export interface AutomationLocalRuntimeHostPort {
  inspect(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<AutomationLocalRuntimeHostInspection | undefined>;
  authorizeAsset(input: {
    readonly sourceId: string;
    readonly assetKey: AutomationLocalRuntimeAssetKey;
    readonly ownerId: string;
    readonly signal?: AbortSignal;
  }): Promise<void>;
  disconnect(input: {
    readonly sourceId: string;
    readonly runtimeId: string;
    readonly signal?: AbortSignal;
  }): Promise<void>;
  openInstallationGuide(input: { readonly sourceId: string; readonly url: string }): Promise<void>;
  copyInstallationCommand(input: {
    readonly sourceId: string;
    readonly command: string;
  }): Promise<void>;
}

export interface AutomationLocalRuntimeManagementService {
  list(signal?: AbortSignal): Promise<readonly AutomationLocalRuntimeProjection[]>;
  openInstallationGuide(sourceId: string): Promise<readonly AutomationLocalRuntimeProjection[]>;
  copyInstallationCommand(sourceId: string): Promise<readonly AutomationLocalRuntimeProjection[]>;
  authorizeAsset(
    sourceId: string,
    assetKey: AutomationLocalRuntimeAssetKey,
    ownerId: string,
    signal?: AbortSignal,
  ): Promise<readonly AutomationLocalRuntimeProjection[]>;
  recheck(
    sourceId: string,
    runtimeId: string,
    signal?: AbortSignal,
  ): Promise<readonly AutomationLocalRuntimeProjection[]>;
  disconnect(
    sourceId: string,
    runtimeId: string,
    signal?: AbortSignal,
  ): Promise<readonly AutomationLocalRuntimeProjection[]>;
}

export function createAutomationLocalRuntimeManagementService(options: {
  readonly sources: readonly AutomationLocalRuntimeSourceDescriptor[];
  readonly host: AutomationLocalRuntimeHostPort;
}): AutomationLocalRuntimeManagementService {
  const sources = new Map<string, AutomationLocalRuntimeSourceDescriptor>();
  for (const candidate of options.sources) {
    const source = validateDescriptor(candidate);
    if (sources.has(source.sourceId)) {
      throw new Error(`Automation local runtime source '${source.sourceId}' is duplicated.`);
    }
    sources.set(source.sourceId, source);
  }

  const service: AutomationLocalRuntimeManagementService = {
    async list(signal) {
      return Object.freeze(
        await Promise.all(
          [...sources.values()].map((source) => projectSource(source, options.host, signal)),
        ),
      );
    },

    async openInstallationGuide(sourceId) {
      const source = requireSource(sources, sourceId);
      await options.host.openInstallationGuide({ sourceId, url: source.installationGuideUrl });
      return await service.list();
    },

    async copyInstallationCommand(sourceId) {
      const source = requireSource(sources, sourceId);
      await options.host.copyInstallationCommand({
        sourceId,
        command: source.installationCommand,
      });
      return await service.list();
    },

    async authorizeAsset(sourceId, assetKey, ownerId, signal) {
      const source = requireSource(sources, sourceId);
      requireAsset(source, assetKey);
      requireIdentity(ownerId, 'Automation local runtime authorization owner');
      await options.host.authorizeAsset({
        sourceId,
        assetKey,
        ownerId,
        ...(signal === undefined ? {} : { signal }),
      });
      return await service.list(signal);
    },

    async recheck(sourceId, runtimeId, signal) {
      requireSource(sources, sourceId);
      const current = await options.host.inspect(sourceId, signal);
      if (!current || current.runtimeId !== runtimeId) {
        throw new Error('Automation local runtime recheck identity is stale.');
      }
      return await service.list(signal);
    },

    async disconnect(sourceId, runtimeId, signal) {
      requireSource(sources, sourceId);
      const current = await options.host.inspect(sourceId, signal);
      if (!current || current.runtimeId !== runtimeId) {
        throw new Error('Automation local runtime disconnect identity is stale.');
      }
      await options.host.disconnect({
        sourceId,
        runtimeId,
        ...(signal === undefined ? {} : { signal }),
      });
      return await service.list(signal);
    },
  };
  return Object.freeze(service);
}

async function projectSource(
  source: AutomationLocalRuntimeSourceDescriptor,
  host: AutomationLocalRuntimeHostPort,
  signal?: AbortSignal,
): Promise<AutomationLocalRuntimeProjection> {
  let inspection: AutomationLocalRuntimeHostInspection | undefined;
  try {
    inspection = await host.inspect(source.sourceId, signal);
  } catch {
    return invalidProjection(source, 'authorization-invalid');
  }
  if (!inspection) return missingProjection(source);
  if (!hasExactAssets(source, inspection.assets)) {
    return invalidProjection(source, 'authorization-invalid', inspection.runtimeId);
  }
  const assetDiagnostics = diagnosticsForAssets(inspection.assets);
  if (assetDiagnostics.length > 0) {
    return {
      ...baseProjection(source),
      authorized: true,
      runtimeId: inspection.runtimeId,
      state: 'error',
      assets: inspection.assets,
      diagnostics: assetDiagnostics,
    };
  }
  if (!inspection.server || !inspection.operations) {
    return {
      ...baseProjection(source),
      authorized: true,
      runtimeId: inspection.runtimeId,
      state: 'error',
      assets: inspection.assets,
      diagnostics: Object.freeze(['provider-unavailable']),
    };
  }
  if (inspection.server.name !== source.expectedServer.name) {
    return {
      ...baseProjection(source),
      authorized: true,
      runtimeId: inspection.runtimeId,
      state: 'error',
      assets: inspection.assets,
      diagnostics: Object.freeze(['provider-mismatch']),
    };
  }
  const profile = localProfile(source, inspection.runtimeId);
  const support = inspectAutomationProviderSupport(
    profile,
    parseAutomationProviderInspection({
      provider: profile.provider,
      operations: inspection.operations,
    }),
  );
  const diagnostics = Object.freeze(
    [...new Set(support.diagnostics.map((diagnostic) => diagnostic.code))].sort(),
  ) as readonly AutomationLocalRuntimeDiagnosticCode[];
  return {
    ...baseProjection(source),
    authorized: true,
    runtimeId: inspection.runtimeId,
    state: diagnostics.length === 0 ? 'ready' : 'error',
    assets: inspection.assets,
    diagnostics,
  };
}

function localProfile(
  source: AutomationLocalRuntimeSourceDescriptor,
  runtimeId: string,
): AutomationProfile {
  return parseAutomationProfile({
    ...source.profile,
    id: source.sourceId,
    provider: {
      ...source.profile.provider,
      deliverySource: { kind: 'user-managed-local-runtime', runtimeId },
    },
  });
}

function validateDescriptor(
  descriptor: AutomationLocalRuntimeSourceDescriptor,
): AutomationLocalRuntimeSourceDescriptor {
  const profile = parseAutomationProfile(descriptor.profile);
  if (profile.provider.deliverySource.kind !== 'bundled-adapter') {
    throw new Error(
      'Automation local runtime descriptor must derive from a bundled product adapter.',
    );
  }
  if (!descriptor.sourceId || !descriptor.displayName || descriptor.assets.length === 0) {
    throw new Error('Automation local runtime descriptor identity, name and assets are required.');
  }
  if (!descriptor.expectedServer.name) {
    throw new Error('Automation local runtime expected MCP server identity is required.');
  }
  requireHttps(descriptor.installationGuideUrl);
  if (!descriptor.installationCommand.trim()) {
    throw new Error('Automation local runtime installation command is required.');
  }
  const keys = descriptor.assets.map((asset) => asset.key);
  if (new Set(keys).size !== keys.length || descriptor.assets.some((asset) => !asset.label)) {
    throw new Error('Automation local runtime assets are invalid.');
  }
  if (
    (profile.provider.kind === 'browser') !== keys.includes('browser-executable') ||
    !keys.includes('provider-runtime')
  ) {
    throw new Error('Automation local runtime assets do not match the provider kind.');
  }
  return Object.freeze({
    ...descriptor,
    profile,
    assets: Object.freeze(descriptor.assets.map((asset) => Object.freeze({ ...asset }))),
    expectedServer: Object.freeze({ ...descriptor.expectedServer }),
  });
}

function missingProjection(
  source: AutomationLocalRuntimeSourceDescriptor,
): AutomationLocalRuntimeProjection {
  return {
    ...baseProjection(source),
    authorized: false,
    runtimeId: '',
    state: 'not-configured',
    assets: Object.freeze(
      source.assets.map((asset) => ({
        ...asset,
        authorized: false,
        runtimeId: '',
        displayName: '',
        status: 'missing' as const,
      })),
    ),
    diagnostics: Object.freeze([]),
  };
}

function invalidProjection(
  source: AutomationLocalRuntimeSourceDescriptor,
  diagnostic: AutomationLocalRuntimeDiagnosticCode,
  runtimeId = 'local-runtime:invalid',
): AutomationLocalRuntimeProjection {
  return {
    ...missingProjection(source),
    authorized: true,
    runtimeId,
    state: 'error',
    diagnostics: Object.freeze([diagnostic]),
  };
}

function baseProjection(source: AutomationLocalRuntimeSourceDescriptor) {
  return {
    sourceId: source.sourceId,
    displayName: source.displayName,
    providerKind: source.profile.provider.kind,
    installationGuideUrl: source.installationGuideUrl,
    installationCommand: source.installationCommand,
  } as const;
}

function hasExactAssets(
  source: AutomationLocalRuntimeSourceDescriptor,
  assets: readonly AutomationLocalRuntimeAssetProjection[],
): boolean {
  if (source.assets.length !== assets.length) return false;
  return source.assets.every((expected) => {
    const asset = assets.find((candidate) => candidate.key === expected.key);
    return asset?.label === expected.label;
  });
}

function diagnosticsForAssets(
  assets: readonly AutomationLocalRuntimeAssetProjection[],
): readonly AutomationLocalRuntimeDiagnosticCode[] {
  const diagnostics = assets.flatMap((asset): AutomationLocalRuntimeDiagnosticCode[] => {
    switch (asset.status) {
      case 'missing':
        return ['asset-missing'];
      case 'invalid':
        return ['asset-invalid'];
      case 'changed':
        return ['asset-changed'];
      case 'valid':
        return [];
    }
  });
  return Object.freeze([...new Set(diagnostics)].sort());
}

function requireSource(
  sources: ReadonlyMap<string, AutomationLocalRuntimeSourceDescriptor>,
  sourceId: string,
): AutomationLocalRuntimeSourceDescriptor {
  const source = sources.get(sourceId);
  if (!source) throw new Error(`Automation local runtime source '${sourceId}' is unavailable.`);
  return source;
}

function requireAsset(
  source: AutomationLocalRuntimeSourceDescriptor,
  assetKey: AutomationLocalRuntimeAssetKey,
): void {
  if (!source.assets.some((asset) => asset.key === assetKey)) {
    throw new Error(
      `Automation local runtime asset '${assetKey}' is unavailable for '${source.sourceId}'.`,
    );
  }
}

function requireHttps(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Automation local runtime installation guide requires credential-free HTTPS.');
  }
}

function requireIdentity(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}
