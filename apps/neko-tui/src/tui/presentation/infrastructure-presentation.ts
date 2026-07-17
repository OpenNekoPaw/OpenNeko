import type {
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProviderAvailabilitySummary,
} from '@neko/shared';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export interface TerminalMcpServerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly transport?: string;
  readonly toolCount?: number;
}

export type McpCommandSemanticResult =
  | Readonly<{ readonly kind: 'servers'; readonly servers: readonly TerminalMcpServerSnapshot[] }>
  | Readonly<{
      readonly kind: 'tools';
      readonly serverId?: string;
      readonly tools: readonly string[];
    }>
  | Readonly<{
      readonly kind: 'operation-complete';
      readonly operation: 'connected' | 'disconnected' | 'reconnected';
      readonly serverId: string;
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code:
        | 'unavailable'
        | 'tools-unavailable'
        | 'usage'
        | 'unknown-server'
        | 'server-disabled'
        | 'connect-unavailable'
        | 'disconnect-unavailable'
        | 'reconnect-unavailable'
        | 'unknown-command'
        | 'operation-failed';
      readonly serverId?: string;
      readonly command?: string;
      readonly detail?: string;
    }>;

export type CapabilityCommandSemanticResult =
  | Readonly<{
      readonly kind: 'providers';
      readonly providers: readonly AgentCapabilityProviderAvailabilitySummary[];
      readonly diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[];
    }>
  | Readonly<{
      readonly kind: 'provider';
      readonly provider: AgentCapabilityProviderAvailabilitySummary;
    }>
  | Readonly<{
      readonly kind: 'tools';
      readonly providerId?: string;
      readonly tools: readonly string[];
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code: 'unavailable' | 'show-usage' | 'unknown-provider' | 'unknown-command';
      readonly providerId?: string;
      readonly command?: string;
    }>;

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentMcpCommand(
  result: McpCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'servers':
      return { kind: 'output', output: presentMcpServers(result.servers, context) };
    case 'tools':
      return { kind: 'output', output: presentMcpTools(result.tools, result.serverId, context) };
    case 'operation-complete':
      return {
        kind: 'output',
        output: context.t(`agent.terminal.mcp.${result.operation}`, { serverId: result.serverId }),
      };
    case 'diagnostic':
      return presentMcpDiagnostic(result, context);
  }
}

export function presentCapabilityCommand(
  result: CapabilityCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'providers':
      return {
        kind: 'output',
        output: presentCapabilityProviders(result.providers, result.diagnostics, context),
      };
    case 'provider':
      return { kind: 'output', output: presentCapabilityProvider(result.provider, context) };
    case 'tools':
      return {
        kind: 'output',
        output: presentCapabilityTools(result.tools, result.providerId, context),
      };
    case 'diagnostic':
      return presentCapabilityCommandDiagnostic(result, context);
  }
}

function presentMcpServers(
  servers: readonly TerminalMcpServerSnapshot[],
  context: PresentationContext,
): string {
  if (servers.length === 0) {
    return context.t('agent.terminal.mcp.servers.empty');
  }
  return [
    context.t('agent.terminal.mcp.servers.header'),
    ...servers.map((server) => {
      const details = [
        context.t('agent.terminal.mcp.servers.transport', {
          transport: server.transport ?? context.t('agent.terminal.value.unknown'),
        }),
        server.toolCount === undefined
          ? undefined
          : context.t('agent.terminal.mcp.servers.tools', {
              count: context.format.count(server.toolCount),
            }),
        server.name !== server.id ? server.name : undefined,
      ].filter((value): value is string => value !== undefined);
      return context.t('agent.terminal.mcp.servers.row', {
        serverId: server.id,
        status: presentMcpStatus(server, context),
        details: details.join('  '),
      });
    }),
    '',
    context.t('agent.terminal.mcp.usage'),
  ].join('\n');
}

function presentMcpTools(
  tools: readonly string[],
  serverId: string | undefined,
  context: PresentationContext,
): string {
  if (tools.length === 0) {
    return serverId
      ? context.t('agent.terminal.mcp.tools.emptyScoped', { serverId })
      : context.t('agent.terminal.mcp.tools.empty');
  }
  return [
    serverId
      ? context.t('agent.terminal.mcp.tools.headerScoped', { serverId })
      : context.t('agent.terminal.mcp.tools.header'),
    ...tools.map((tool) => context.t('agent.terminal.mcp.tools.row', { tool })),
  ].join('\n');
}

function presentMcpStatus(server: TerminalMcpServerSnapshot, context: PresentationContext): string {
  if (!server.enabled) return context.t('agent.terminal.value.mcpStatus.disabled');
  return server.connected
    ? context.t('agent.terminal.value.mcpStatus.connected')
    : context.t('agent.terminal.value.mcpStatus.disconnected');
}

function presentMcpDiagnostic(
  result: Extract<McpCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'unavailable':
    case 'tools-unavailable':
    case 'usage':
    case 'connect-unavailable':
    case 'disconnect-unavailable':
    case 'reconnect-unavailable':
      return {
        kind: 'error',
        diagnosticCode: `mcp.${result.code}`,
        error: context.t(`agent.terminal.diagnostic.mcp.${result.code}`),
      };
    case 'unknown-server':
    case 'server-disabled':
      return {
        kind: 'error',
        diagnosticCode: `mcp.${result.code}`,
        error: context.t(`agent.terminal.diagnostic.mcp.${result.code}`, {
          serverId: required(result.serverId, result.code),
        }),
      };
    case 'unknown-command':
      return {
        kind: 'error',
        diagnosticCode: 'mcp.unknown-command',
        error: context.t('agent.terminal.diagnostic.mcp.unknown-command', {
          command: required(result.command, result.code),
        }),
      };
    case 'operation-failed':
      return {
        kind: 'error',
        diagnosticCode: 'mcp.operation-failed',
        error: context.t('agent.terminal.diagnostic.mcp.operation-failed', {
          detail: required(result.detail, result.code),
        }),
      };
  }
}

function presentCapabilityProviders(
  providers: readonly AgentCapabilityProviderAvailabilitySummary[],
  diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[],
  context: PresentationContext,
): string {
  if (providers.length === 0) {
    return diagnostics.length === 0
      ? context.t('agent.terminal.capability.providers.empty')
      : presentCapabilityDiagnostics(diagnostics, context);
  }
  const lines = [
    context.t('agent.terminal.capability.providers.header'),
    ...providers.map((provider) => {
      const state =
        provider.loaded.length > 0
          ? context.t('agent.terminal.value.capabilityState.loaded')
          : provider.skipped.length > 0
            ? context.t('agent.terminal.value.capabilityState.skipped')
            : context.t('agent.terminal.value.capabilityState.empty');
      return context.t('agent.terminal.capability.providers.row', {
        providerId: provider.providerId,
        state,
        loadedCount: context.format.count(provider.loaded.length),
        skippedCount: context.format.count(provider.skipped.length),
      });
    }),
  ];
  if (diagnostics.length > 0) {
    lines.push('', presentCapabilityDiagnostics(diagnostics, context));
  }
  lines.push('', context.t('agent.terminal.capability.usage'));
  return lines.join('\n');
}

function presentCapabilityProvider(
  provider: AgentCapabilityProviderAvailabilitySummary,
  context: PresentationContext,
): string {
  const lines = [
    context.t('agent.terminal.capability.provider.header', { providerId: provider.providerId }),
  ];
  if (provider.version) {
    lines.push(
      context.t('agent.terminal.capability.provider.version', { version: provider.version }),
    );
  }
  lines.push(context.t('agent.terminal.capability.provider.loaded'));
  lines.push(
    ...(provider.loaded.length === 0
      ? [context.t('agent.terminal.value.noneIndented')]
      : provider.loaded.map((contribution) =>
          context.t('agent.terminal.capability.provider.loadedRow', {
            kind: contribution.kind,
            name: contribution.name,
          }),
        )),
  );
  lines.push(context.t('agent.terminal.capability.provider.skipped'));
  lines.push(
    ...(provider.skipped.length === 0
      ? [context.t('agent.terminal.value.noneIndented')]
      : provider.skipped.map((diagnostic) => presentCapabilityDiagnostic(diagnostic, context))),
  );
  return lines.join('\n');
}

function presentCapabilityTools(
  tools: readonly string[],
  providerId: string | undefined,
  context: PresentationContext,
): string {
  if (tools.length === 0) {
    return providerId
      ? context.t('agent.terminal.capability.tools.emptyScoped', { providerId })
      : context.t('agent.terminal.capability.tools.empty');
  }
  return [
    providerId
      ? context.t('agent.terminal.capability.tools.headerScoped', { providerId })
      : context.t('agent.terminal.capability.tools.header'),
    ...tools.map((tool) => context.t('agent.terminal.capability.tools.row', { tool })),
  ].join('\n');
}

function presentCapabilityDiagnostics(
  diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[],
  context: PresentationContext,
): string {
  if (diagnostics.length === 0) {
    return context.t('agent.terminal.capability.diagnostics.empty');
  }
  return [
    context.t('agent.terminal.capability.diagnostics.header'),
    ...diagnostics.map((diagnostic) => presentCapabilityDiagnostic(diagnostic, context)),
  ].join('\n');
}

function presentCapabilityDiagnostic(
  diagnostic: AgentCapabilityAvailabilityDiagnostic,
  context: PresentationContext,
): string {
  const base = {
    level: diagnostic.level,
    providerId: diagnostic.providerId,
    kind: diagnostic.contributionKind,
    reason: diagnostic.reason,
  };
  if (diagnostic.contributionName && diagnostic.requirement) {
    return context.t('agent.terminal.capability.diagnostics.rowWithNameAndRequirement', {
      ...base,
      name: diagnostic.contributionName,
      requirement: diagnostic.requirement,
    });
  }
  if (diagnostic.contributionName) {
    return context.t('agent.terminal.capability.diagnostics.rowWithName', {
      ...base,
      name: diagnostic.contributionName,
    });
  }
  if (diagnostic.requirement) {
    return context.t('agent.terminal.capability.diagnostics.rowWithRequirement', {
      ...base,
      requirement: diagnostic.requirement,
    });
  }
  return context.t('agent.terminal.capability.diagnostics.row', base);
}

function presentCapabilityCommandDiagnostic(
  result: Extract<CapabilityCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'unavailable':
    case 'show-usage':
      return {
        kind: 'error',
        diagnosticCode: `capability.${result.code}`,
        error: context.t(`agent.terminal.diagnostic.capability.${result.code}`),
      };
    case 'unknown-provider':
      return {
        kind: 'error',
        diagnosticCode: 'capability.unknown-provider',
        error: context.t('agent.terminal.diagnostic.capability.unknown-provider', {
          providerId: required(result.providerId, result.code),
        }),
      };
    case 'unknown-command':
      return {
        kind: 'error',
        diagnosticCode: 'capability.unknown-command',
        error: context.t('agent.terminal.diagnostic.capability.unknown-command', {
          command: required(result.command, result.code),
        }),
      };
  }
}

function required(value: string | undefined, code: string): string {
  if (value === undefined) {
    throw new Error(`Missing semantic value for terminal diagnostic: ${code}`);
  }
  return value;
}
