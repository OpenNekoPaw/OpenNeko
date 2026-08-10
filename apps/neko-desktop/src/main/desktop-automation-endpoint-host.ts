import type {
  MCPConnectionInfo,
  MCPRequestOptions,
  MCPServerConfig,
  MCPToolResult,
  MCPToolDefinition,
} from '@neko/agent-contracts';
import { createMCPClient } from '@neko/agent-runtime';
import {
  parseAutomationEndpointConfigurationInput,
  type AutomationEndpointConfigurationInput,
} from '@neko/automation-contracts/endpoint-management';
import {
  BROWSER_USE_OBSERVE_PROFILE,
  CUA_DRIVER_OBSERVE_PROFILE,
  createAutomationEndpointManagementService,
  digestAutomationInputSchema,
  type AutomationEndpointConnectorDescriptor,
  type AutomationEndpointManagementService,
  type AutomationEndpointProbePort,
  type AutomationEndpointSecretPort,
  type AutomationMcpClientFactoryPort,
  type AutomationMcpClientPort,
  type AutomationMcpToolDefinition,
} from '@neko/automation-node';
import type { HostSecretPort } from '@neko/host/ports';

interface DesktopAutomationEndpointMcpClient {
  connect(options?: MCPRequestOptions): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionInfo(): MCPConnectionInfo | undefined;
  listTools(options?: MCPRequestOptions): Promise<MCPToolDefinition[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: MCPRequestOptions,
  ): Promise<MCPToolResult>;
}

export interface DesktopAutomationEndpointHost {
  readonly management: AutomationEndpointManagementService;
  createSessionClients(input: {
    readonly connectorId: string;
    readonly endpointId: string;
  }): AutomationMcpClientFactoryPort;
}

const ENDPOINT_SECRET_PREFIX = 'openneko.automation.endpoint:';

const DESKTOP_AUTOMATION_ENDPOINT_CONNECTORS = Object.freeze([
  Object.freeze({
    connectorId: 'browser-use.observe.endpoint',
    displayName: 'Browser Use 0.13.7',
    profile: BROWSER_USE_OBSERVE_PROFILE,
    expectedServer: Object.freeze({ name: 'browser-use', version: '0.1.0' }),
  }),
  Object.freeze({
    connectorId: 'computer-use.observe.endpoint',
    displayName: 'Cua Driver 0.19.2',
    profile: CUA_DRIVER_OBSERVE_PROFILE,
    expectedServer: Object.freeze({ name: 'cua-driver', version: '0.19.2' }),
  }),
] satisfies readonly AutomationEndpointConnectorDescriptor[]);

export function createDesktopAutomationEndpointHost(options: {
  readonly secrets: HostSecretPort;
  readonly createClient?: (config: MCPServerConfig) => DesktopAutomationEndpointMcpClient;
}): DesktopAutomationEndpointHost {
  const createClient = options.createClient ?? ((config) => createMCPClient(config));
  const connectors = new Map<string, AutomationEndpointConnectorDescriptor>(
    DESKTOP_AUTOMATION_ENDPOINT_CONNECTORS.map((connector) => [connector.connectorId, connector]),
  );
  const createSessionClients = (input: {
    readonly connectorId: string;
    readonly endpointId: string;
  }): AutomationMcpClientFactoryPort => {
    const connector = connectors.get(input.connectorId);
    if (!connector) {
      throw new Error(`Automation endpoint connector '${input.connectorId}' is unavailable.`);
    }
    return createStoredEndpointMcpClientFactory({
      connector,
      endpointId: input.endpointId,
      secrets: options.secrets,
      createClient,
    });
  };
  const management = createAutomationEndpointManagementService({
    connectors: DESKTOP_AUTOMATION_ENDPOINT_CONNECTORS,
    secrets: createEndpointSecretAdapter(options.secrets),
    probe: createDesktopAutomationEndpointProbe({ connectors, createSessionClients }),
  });
  const host: DesktopAutomationEndpointHost = {
    management,
    createSessionClients,
  };
  return Object.freeze(host);
}

function createDesktopAutomationEndpointProbe(options: {
  readonly connectors: ReadonlyMap<string, AutomationEndpointConnectorDescriptor>;
  readonly createSessionClients: DesktopAutomationEndpointHost['createSessionClients'];
}): AutomationEndpointProbePort {
  const probe: AutomationEndpointProbePort = {
    async inspect(input) {
      const connector = options.connectors.get(input.connectorId);
      if (!connector) {
        throw new Error(`Automation endpoint connector '${input.connectorId}' is unavailable.`);
      }
      const client = options.createSessionClients(input).createQualificationClient();
      let tools: readonly AutomationMcpToolDefinition[];
      try {
        await client.connect({
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        tools = await client.listTools({
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
      } catch (qualificationError) {
        try {
          await client.disconnect();
        } catch (disconnectError) {
          throw new AggregateError(
            [qualificationError, disconnectError],
            'Automation endpoint qualification and cleanup both failed.',
          );
        }
        throw qualificationError;
      }
      await client.disconnect();
      return Object.freeze({
        server: Object.freeze({ ...connector.expectedServer }),
        operations: Object.freeze(
          tools.map((tool) =>
            Object.freeze({
              name: tool.name,
              inputSchemaDigest: digestAutomationInputSchema(tool.inputSchema),
              annotations: Object.freeze({
                ...(tool.annotations?.readOnlyHint === undefined
                  ? {}
                  : { readOnlyHint: tool.annotations.readOnlyHint }),
                ...(tool.annotations?.destructiveHint === undefined
                  ? {}
                  : { destructiveHint: tool.annotations.destructiveHint }),
              }),
            }),
          ),
        ),
      });
    },
  };
  return Object.freeze(probe);
}

function createStoredEndpointMcpClientFactory(options: {
  readonly connector: AutomationEndpointConnectorDescriptor;
  readonly endpointId: string;
  readonly secrets: HostSecretPort;
  readonly createClient: (config: MCPServerConfig) => DesktopAutomationEndpointMcpClient;
}): AutomationMcpClientFactoryPort {
  const factory: AutomationMcpClientFactoryPort = {
    createQualificationClient: () =>
      createStoredEndpointMcpClient({
        ...options,
        ownerId: `qualification:${options.endpointId}`,
        timeoutMs: 5_000,
      }),
    createSessionClient: (input) => {
      if (input.target.kind !== options.connector.profile.provider.kind) {
        throw new Error('Automation endpoint target does not match the reviewed connector.');
      }
      return createStoredEndpointMcpClient({
        ...options,
        ownerId: `session:${input.sessionId}`,
        timeoutMs: input.timeoutMs,
      });
    },
  };
  return Object.freeze(factory);
}

function createStoredEndpointMcpClient(options: {
  readonly connector: AutomationEndpointConnectorDescriptor;
  readonly endpointId: string;
  readonly ownerId: string;
  readonly timeoutMs: number;
  readonly secrets: HostSecretPort;
  readonly createClient: (config: MCPServerConfig) => DesktopAutomationEndpointMcpClient;
}): AutomationMcpClientPort {
  let client: DesktopAutomationEndpointMcpClient | undefined;
  const requireClient = (): DesktopAutomationEndpointMcpClient => {
    if (!client) throw new Error('Automation endpoint MCP client is not connected.');
    return client;
  };
  const endpointClient: AutomationMcpClientPort = {
    async connect(input) {
      if (client) throw new Error('Automation endpoint MCP client is already connected.');
      const configuration = await readStoredEndpointConfiguration({
        connectorId: options.connector.connectorId,
        endpointId: options.endpointId,
        secrets: options.secrets,
      });
      const created = options.createClient(
        endpointMcpConfig({
          ownerId: options.ownerId,
          displayName: options.connector.displayName,
          configuration,
          timeoutMs: options.timeoutMs,
        }),
      );
      client = created;
      await created.connect({ ...(input.signal === undefined ? {} : { signal: input.signal }) });
      const connection = requireConnectionInfo(created);
      if (
        connection.server.name !== options.connector.expectedServer.name ||
        connection.server.version !== options.connector.expectedServer.version
      ) {
        throw new Error(
          'User-managed Automation endpoint MCP identity does not match the reviewed connector.',
        );
      }
    },
    async disconnect() {
      const owned = client;
      if (!owned) return;
      await owned.disconnect();
      client = undefined;
    },
    async listTools(input) {
      const tools = await requireClient().listTools({
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return tools.map((tool) => ({
        name: tool.name,
        inputSchema: tool.inputSchema,
        ...(tool.annotations === undefined
          ? {}
          : {
              annotations: {
                ...(tool.annotations.readOnlyHint === undefined
                  ? {}
                  : { readOnlyHint: tool.annotations.readOnlyHint }),
                ...(tool.annotations.destructiveHint === undefined
                  ? {}
                  : { destructiveHint: tool.annotations.destructiveHint }),
              },
            }),
      }));
    },
    async callTool(input) {
      const result = await requireClient().callTool(
        input.name,
        { ...input.arguments },
        {
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        },
      );
      return {
        content: result.content,
        ...(result.structuredContent === undefined
          ? {}
          : { structuredContent: result.structuredContent }),
        ...(result.isError === undefined ? {} : { isError: result.isError }),
      };
    },
  };
  return Object.freeze(endpointClient);
}

function endpointMcpConfig(input: {
  readonly ownerId: string;
  readonly displayName: string;
  readonly configuration: AutomationEndpointConfigurationInput;
  readonly timeoutMs: number;
}): MCPServerConfig {
  return {
    id: `automation:user-managed-endpoint:${input.ownerId}`,
    name: input.displayName,
    description: 'Session-owned connection to a user-managed Automation service',
    category: 'productivity',
    transport: 'http',
    url: input.configuration.url,
    headers: authorizationHeaders(input.configuration.authorization),
    enabled: true,
    requestTimeout: input.timeoutMs,
  };
}

async function readStoredEndpointConfiguration(input: {
  readonly connectorId: string;
  readonly endpointId: string;
  readonly secrets: HostSecretPort;
}): Promise<AutomationEndpointConfigurationInput> {
  const serialized = await input.secrets.get(`${ENDPOINT_SECRET_PREFIX}${input.connectorId}`);
  if (serialized === undefined) {
    throw new Error(`Automation endpoint connector '${input.connectorId}' is not configured.`);
  }
  let configuration: AutomationEndpointConfigurationInput;
  try {
    configuration = parseAutomationEndpointConfigurationInput(JSON.parse(serialized));
  } catch {
    throw new Error(
      `Automation endpoint connector '${input.connectorId}' configuration is invalid.`,
    );
  }
  if (
    configuration.connectorId !== input.connectorId ||
    configuration.endpointId !== input.endpointId
  ) {
    throw new Error('Automation endpoint connection identity is stale.');
  }
  return configuration;
}

function createEndpointSecretAdapter(secrets: HostSecretPort): AutomationEndpointSecretPort {
  const adapter: AutomationEndpointSecretPort = {
    read: (connectorId) => secrets.get(`${ENDPOINT_SECRET_PREFIX}${connectorId}`),
    write: (connectorId, value) => secrets.set(`${ENDPOINT_SECRET_PREFIX}${connectorId}`, value),
    delete: (connectorId) => secrets.delete(`${ENDPOINT_SECRET_PREFIX}${connectorId}`),
  };
  return Object.freeze(adapter);
}

function authorizationHeaders(
  authorization: AutomationEndpointConfigurationInput['authorization'],
): Record<string, string> {
  switch (authorization.kind) {
    case 'none':
      return {};
    case 'bearer':
      return { Authorization: `Bearer ${authorization.secret}` };
    case 'header':
      return { [authorization.name]: authorization.secret };
  }
}

function requireConnectionInfo(client: DesktopAutomationEndpointMcpClient): MCPConnectionInfo {
  const connection = client.getConnectionInfo();
  if (!connection) {
    throw new Error('User-managed Automation endpoint returned no negotiated MCP identity.');
  }
  return connection;
}
