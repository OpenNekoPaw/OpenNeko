import {
  parseAutomationEndpointConfigurationInput,
  type AutomationEndpointConfigurationInput,
  type AutomationEndpointDiagnosticCode,
  type AutomationEndpointProjection,
} from '@neko/automation-contracts/endpoint-management';
import {
  parseAutomationProfile,
  parseAutomationProviderInspection,
  type AutomationProfile,
  type AutomationProviderOperation,
} from '@neko/automation-contracts';
import { qualifyAutomationProviderProfile } from './qualification';

export interface AutomationEndpointConnectorDescriptor {
  readonly connectorId: string;
  readonly displayName: string;
  readonly profile: AutomationProfile;
  readonly expectedServer: {
    readonly name: string;
    readonly version: string;
  };
}

export interface AutomationEndpointSecretPort {
  read(connectorId: string): Promise<string | undefined>;
  write(connectorId: string, value: string): Promise<void>;
  delete(connectorId: string): Promise<void>;
}

export interface AutomationEndpointProbePort {
  inspect(input: {
    readonly connectorId: string;
    readonly endpointId: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly server: { readonly name: string; readonly version: string };
    readonly operations: readonly AutomationProviderOperation[];
  }>;
}

export interface AutomationEndpointManagementService {
  list(signal?: AbortSignal): Promise<readonly AutomationEndpointProjection[]>;
  configure(input: unknown, signal?: AbortSignal): Promise<readonly AutomationEndpointProjection[]>;
  remove(
    connectorId: string,
    endpointId: string,
    signal?: AbortSignal,
  ): Promise<readonly AutomationEndpointProjection[]>;
}

export function createAutomationEndpointManagementService(options: {
  readonly connectors: readonly AutomationEndpointConnectorDescriptor[];
  readonly secrets: AutomationEndpointSecretPort;
  readonly probe: AutomationEndpointProbePort;
}): AutomationEndpointManagementService {
  const connectors = new Map<string, AutomationEndpointConnectorDescriptor>();
  for (const candidate of options.connectors) {
    const descriptor = validateDescriptor(candidate);
    if (connectors.has(descriptor.connectorId)) {
      throw new Error(`Automation endpoint connector '${descriptor.connectorId}' is duplicated.`);
    }
    connectors.set(descriptor.connectorId, descriptor);
  }

  const service: AutomationEndpointManagementService = {
    async list(signal) {
      return Object.freeze(
        await Promise.all(
          [...connectors.values()].map((descriptor) =>
            projectStoredEndpoint(descriptor, options.secrets, options.probe, signal),
          ),
        ),
      );
    },

    async configure(input, signal) {
      const configuration = parseAutomationEndpointConfigurationInput(input);
      requireConnector(connectors, configuration.connectorId);
      await options.secrets.write(configuration.connectorId, JSON.stringify(configuration));
      return await service.list(signal);
    },

    async remove(connectorId, endpointId, signal) {
      const descriptor = requireConnector(connectors, connectorId);
      const stored = await readConfiguration(options.secrets, descriptor.connectorId);
      if (stored.status === 'missing') {
        throw new Error(`Automation endpoint connector '${connectorId}' is not configured.`);
      }
      if (stored.status === 'invalid') {
        throw new Error(`Automation endpoint connector '${connectorId}' configuration is invalid.`);
      }
      if (stored.configuration.endpointId !== endpointId) {
        throw new Error('Automation endpoint removal identity is stale.');
      }
      await options.secrets.delete(connectorId);
      return await service.list(signal);
    },
  };
  return Object.freeze(service);
}

async function projectStoredEndpoint(
  descriptor: AutomationEndpointConnectorDescriptor,
  secrets: AutomationEndpointSecretPort,
  probe: AutomationEndpointProbePort,
  signal?: AbortSignal,
): Promise<AutomationEndpointProjection> {
  const stored = await readConfiguration(secrets, descriptor.connectorId);
  if (stored.status === 'missing') return unconfiguredProjection(descriptor);
  if (stored.status === 'invalid') {
    return {
      ...unconfiguredProjection(descriptor),
      qualificationStatus: 'failed',
      diagnostics: Object.freeze(['configuration-invalid']),
    };
  }
  return await qualifyConfiguredEndpoint(descriptor, stored.configuration, probe, signal);
}

async function qualifyConfiguredEndpoint(
  descriptor: AutomationEndpointConnectorDescriptor,
  configuration: AutomationEndpointConfigurationInput,
  probe: AutomationEndpointProbePort,
  signal?: AbortSignal,
): Promise<AutomationEndpointProjection> {
  const base = configuredProjection(descriptor, configuration);
  let inspection: Awaited<ReturnType<AutomationEndpointProbePort['inspect']>>;
  try {
    inspection = await probe.inspect({
      connectorId: configuration.connectorId,
      endpointId: configuration.endpointId,
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    return {
      ...base,
      healthStatus: 'unreachable',
      qualificationStatus: 'failed',
      diagnostics: Object.freeze(['endpoint-unreachable']),
    };
  }
  if (
    inspection.server.name !== descriptor.expectedServer.name ||
    inspection.server.version !== descriptor.expectedServer.version
  ) {
    return {
      ...base,
      healthStatus: 'reachable',
      providerStatus: 'mismatched',
      qualificationStatus: 'failed',
      diagnostics: Object.freeze(['provider-mismatch']),
    };
  }
  const profile = endpointProfile(descriptor, configuration.endpointId);
  const qualification = qualifyAutomationProviderProfile(
    profile,
    parseAutomationProviderInspection({
      provider: profile.provider,
      operations: inspection.operations,
    }),
  );
  const diagnostics = Object.freeze(
    [...new Set(qualification.diagnostics.map((diagnostic) => diagnostic.code))].sort(),
  ) as readonly AutomationEndpointDiagnosticCode[];
  return {
    ...base,
    healthStatus: 'reachable',
    providerStatus: 'matched',
    qualificationStatus:
      diagnostics.length === 0
        ? 'qualified'
        : qualification.availableOperations.length > 0
          ? 'partial'
          : 'failed',
    diagnostics,
  };
}

function endpointProfile(
  descriptor: AutomationEndpointConnectorDescriptor,
  endpointId: string,
): AutomationProfile {
  return parseAutomationProfile({
    ...descriptor.profile,
    id: descriptor.connectorId,
    provider: {
      ...descriptor.profile.provider,
      deliverySource: { kind: 'user-managed-endpoint', endpointId },
    },
  });
}

async function readConfiguration(
  secrets: AutomationEndpointSecretPort,
  connectorId: string,
): Promise<
  | { readonly status: 'missing' }
  | { readonly status: 'invalid' }
  | { readonly status: 'valid'; readonly configuration: AutomationEndpointConfigurationInput }
> {
  const value = await secrets.read(connectorId);
  if (value === undefined) return { status: 'missing' };
  try {
    const configuration = parseAutomationEndpointConfigurationInput(JSON.parse(value));
    if (configuration.connectorId !== connectorId) return { status: 'invalid' };
    return { status: 'valid', configuration };
  } catch {
    return { status: 'invalid' };
  }
}

function validateDescriptor(
  descriptor: AutomationEndpointConnectorDescriptor,
): AutomationEndpointConnectorDescriptor {
  const profile = parseAutomationProfile(descriptor.profile);
  if (profile.provider.deliverySource.kind === 'user-managed-endpoint') {
    throw new Error('Automation endpoint descriptor must derive from a reviewed managed profile.');
  }
  if (!descriptor.connectorId || !descriptor.displayName) {
    throw new Error('Automation endpoint connector identity and display name are required.');
  }
  if (!descriptor.expectedServer.name || !descriptor.expectedServer.version) {
    throw new Error('Automation endpoint expected MCP server identity is required.');
  }
  return Object.freeze({ ...descriptor, profile });
}

function requireConnector(
  connectors: ReadonlyMap<string, AutomationEndpointConnectorDescriptor>,
  connectorId: string,
): AutomationEndpointConnectorDescriptor {
  const connector = connectors.get(connectorId);
  if (!connector) throw new Error(`Automation endpoint connector '${connectorId}' is unavailable.`);
  return connector;
}

function unconfiguredProjection(
  descriptor: AutomationEndpointConnectorDescriptor,
): AutomationEndpointProjection {
  return {
    connectorId: descriptor.connectorId,
    displayName: descriptor.displayName,
    providerKind: descriptor.profile.provider.kind,
    upstreamRelease: descriptor.profile.provider.upstreamRelease,
    configured: false,
    endpointId: '',
    endpointUrl: '',
    authorizationState: 'not-configured',
    healthStatus: 'not-checked',
    providerStatus: 'unchecked',
    qualificationStatus: 'unqualified',
    diagnostics: Object.freeze([]),
  };
}

function configuredProjection(
  descriptor: AutomationEndpointConnectorDescriptor,
  configuration: AutomationEndpointConfigurationInput,
): AutomationEndpointProjection {
  return {
    ...unconfiguredProjection(descriptor),
    configured: true,
    endpointId: configuration.endpointId,
    endpointUrl: configuration.url,
    authorizationState: configuration.authorization.kind === 'none' ? 'not-required' : 'configured',
  };
}
