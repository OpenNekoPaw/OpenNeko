import { localizePromptFragment } from '@neko/agent-contracts';
import type {
  AgentCapabilityContext,
  AgentCapabilityHostRequirement,
  AgentCapabilityLifecycleHook,
  AgentCapabilityManifest,
  AgentCapabilityProvider,
  AgentCapabilityTrustLevel,
  IToolCategoryRegistry,
  IToolRegistry,
  PromptFragment,
  Tool,
} from '@neko/agent-contracts';

export interface CapabilityProtocolInfo {
  readonly providerId: string;
  readonly trustLevel: AgentCapabilityTrustLevel;
  readonly hostRequirements: readonly AgentCapabilityHostRequirement[];
  readonly lifecycleHooks: readonly AgentCapabilityLifecycleHook[];
  readonly source: 'provider' | 'manifest';
}

interface RegisteredProvider {
  provider: AgentCapabilityProvider;
  protocol: CapabilityProtocolInfo;
  registeredTools: string[];
}

export interface CapabilityRegistryRuntimeDeps {
  toolRegistry: IToolRegistry;
  toolCategoryRegistry?: Pick<IToolCategoryRegistry, 'categorizeTool'> & {
    clearTools?(): void;
  };
}

export type CapabilityDiscoveryDeps = CapabilityRegistryRuntimeDeps;

export interface CapabilityRegistryRuntimeLogger {
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
}

const noopLogger: CapabilityRegistryRuntimeLogger = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
};

type CapabilityDiagnosticLevel = 'debug' | 'info' | 'warn';

export interface CapabilityRuntimeDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly reason?: string;
  readonly context?: Record<string, unknown>;
  readonly error?: unknown;
}

function emitCapabilityDiagnostic(
  logger: CapabilityRegistryRuntimeLogger,
  level: CapabilityDiagnosticLevel,
  diagnostic: CapabilityRuntimeDiagnostic,
): void {
  const payload: Record<string, unknown> = {
    code: diagnostic.code,
  };

  if (diagnostic.reason) {
    payload['reason'] = diagnostic.reason;
  }
  if (diagnostic.context && Object.keys(diagnostic.context).length > 0) {
    payload['context'] = diagnostic.context;
  }
  if (diagnostic.error !== undefined) {
    payload['error'] = toCapabilityDiagnosticError(diagnostic.error);
  }

  logger[level](diagnostic.message, payload);
}

function toCapabilityDiagnosticError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
}

export class CapabilityRegistryRuntime {
  private readonly providers = new Map<string, RegisteredProvider>();
  private readonly manifests = new Map<string, AgentCapabilityManifest>();
  private readonly toolOwners = new Map<string, string>();
  private readonly toolShortNameOwners = new Map<
    string,
    { toolName: string; providerId: string }
  >();
  private readonly diagnostics: CapabilityRuntimeDiagnostic[] = [];
  private readonly logger: CapabilityRegistryRuntimeLogger;
  private capabilityContext: AgentCapabilityContext | null = null;
  private warnedMissingCapabilityContextForFragments = false;

  constructor(
    private readonly deps: CapabilityRegistryRuntimeDeps,
    options: { readonly logger?: CapabilityRegistryRuntimeLogger } = {},
  ) {
    this.logger = options.logger ?? noopLogger;
  }

  setCapabilityContext(context: AgentCapabilityContext): void {
    this.capabilityContext = context;
    this.warnedMissingCapabilityContextForFragments = false;
  }

  replaceManifests(manifests: readonly AgentCapabilityManifest[]): void {
    this.manifests.clear();
    for (const manifest of manifests) {
      this.upsertManifest(manifest);
    }
    this.logger.debug(`Discovered ${this.manifests.size} capability manifest(s)`);
  }

  upsertManifest(manifest: AgentCapabilityManifest): boolean {
    this.manifests.set(manifest.id, manifest);
    return true;
  }

  cleanupProvidersWithoutManifests(): string[] {
    const removed: string[] = [];
    for (const id of this.getRegisteredProviderIds()) {
      if (!this.manifests.has(id) && this.unregisterProvider(id)) {
        removed.push(id);
      }
    }
    return removed;
  }

  registerProvider(provider: AgentCapabilityProvider, context: AgentCapabilityContext): void {
    const { id } = provider;
    this.setCapabilityContext(context);

    if (this.providers.has(id)) {
      this.recordCapabilityDiagnostic('warn', {
        code: 'extension.capability.provider.duplicate-id',
        reason: 'duplicate-provider-id',
        message: 'Capability provider id is already registered; replacing the previous provider.',
        context: {
          providerId: id,
          existingProviderId: id,
          conflictingProviderId: id,
        },
      });
      this.unregisterProvider(id);
    }

    const registeredTools: string[] = [];

    try {
      const tools: Tool[] = provider.getTools(context);
      for (const tool of tools) {
        this.recordCapabilityNameCollision({
          kind: 'tool',
          name: tool.name,
          providerId: id,
          existingOwner: this.toolOwners.get(tool.name),
          existsInRuntime: this.deps.toolRegistry.get(tool.name) !== undefined,
        });
        this.recordToolShortNameRegistration(tool.name, id);
        this.deps.toolRegistry.register(tool);
        this.toolOwners.set(tool.name, id);
        registeredTools.push(tool.name);
      }
    } catch (err) {
      this.logger.warn(`Failed to get tools from provider "${id}"`, { error: err });
    }

    this.providers.set(id, {
      provider,
      protocol: resolveCapabilityProtocolInfo(id, provider, 'provider'),
      registeredTools,
    });

    this.logger.info(`Provider "${id}" registered: ${registeredTools.length} tools`);

    this.syncToolCategories();
  }

  unregisterProvider(id: string): boolean {
    const entry = this.providers.get(id);
    if (!entry) return false;

    for (const toolName of entry.registeredTools) {
      this.deps.toolRegistry.unregister(toolName);
      if (this.toolOwners.get(toolName) === id) {
        this.toolOwners.delete(toolName);
      }
      const shortName = normalizeCapabilityShortName(toolName);
      if (this.toolShortNameOwners.get(shortName)?.providerId === id) {
        this.toolShortNameOwners.delete(shortName);
      }
    }

    entry.provider.dispose?.();
    this.providers.delete(id);

    this.syncToolCategories();
    this.logger.info(`Provider "${id}" unregistered`);
    return true;
  }

  dispose(): void {
    for (const id of this.getRegisteredProviderIds()) {
      this.unregisterProvider(id);
    }
  }

  syncToolCategories(
    targetRegistry: CapabilityRegistryRuntimeDeps['toolCategoryRegistry'] = this.deps
      .toolCategoryRegistry,
  ): void {
    if (!targetRegistry) {
      return;
    }

    targetRegistry.clearTools?.();

    for (const tool of this.deps.toolRegistry.list()) {
      targetRegistry.categorizeTool(tool.name, tool.category);
    }
  }

  getAllProviders(): AgentCapabilityProvider[] {
    return Array.from(this.providers.values()).map((entry) => entry.provider);
  }

  getAllPromptFragments(): PromptFragment[] {
    if (!this.capabilityContext) {
      if (!this.warnedMissingCapabilityContextForFragments) {
        emitCapabilityDiagnostic(this.logger, 'warn', {
          code: 'extension.capability.prompt-fragments-skipped',
          reason: 'missing-capability-context',
          message:
            'Skipping capability prompt fragment aggregation because capability context is not initialized.',
          context: {
            providerCount: this.providers.size,
          },
        });
        this.warnedMissingCapabilityContextForFragments = true;
      }
      return [];
    }

    const aggregated: PromptFragment[] = [];
    for (const { provider } of this.providers.values()) {
      if (!provider.getPromptFragments) continue;
      try {
        const fragments = provider.getPromptFragments(this.capabilityContext);
        if (fragments && fragments.length > 0) {
          aggregated.push(
            ...fragments.map((fragment) =>
              localizePromptFragment(fragment, this.capabilityContext?.locale),
            ),
          );
        }
      } catch (err) {
        this.logger.warn(`Provider "${provider.id}" getPromptFragments threw; skipping`, err);
      }
    }
    return aggregated;
  }

  getAllManifests(): AgentCapabilityManifest[] {
    return Array.from(this.manifests.values());
  }

  getCapabilityProtocolInfo(id: string): CapabilityProtocolInfo | null {
    const registered = this.providers.get(id);
    if (registered) {
      return registered.protocol;
    }
    const manifest = this.manifests.get(id);
    return manifest ? resolveCapabilityProtocolInfo(id, manifest, 'manifest') : null;
  }

  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  get providerCount(): number {
    return this.providers.size;
  }

  getRegisteredProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  getDiagnostics(): readonly CapabilityRuntimeDiagnostic[] {
    return [...this.diagnostics];
  }

  getSubpackage(id: string): { id: string; enabled: boolean } | null {
    const registered = this.providers.get(id);
    if (registered) {
      return {
        id,
        enabled: true,
      };
    }
    const manifest = this.manifests.get(id);
    if (manifest) {
      return {
        id,
        enabled: false,
      };
    }
    return null;
  }

  private recordCapabilityNameCollision(input: {
    kind: 'tool';
    name: string;
    providerId: string;
    existingOwner?: string;
    existsInRuntime: boolean;
  }): void {
    let reason:
      | 'duplicate-name-in-provider'
      | 'provider-name-collision'
      | 'preexisting-name-collision'
      | null = null;

    if (input.existingOwner === input.providerId) {
      reason = 'duplicate-name-in-provider';
    } else if (input.existingOwner) {
      reason = 'provider-name-collision';
    } else if (input.existsInRuntime) {
      reason = 'preexisting-name-collision';
    }

    if (!reason) {
      return;
    }

    this.recordCapabilityDiagnostic('warn', {
      code: `extension.capability.${input.kind}.name-collision`,
      reason,
      message: 'Capability registration is overwriting a shared runtime name.',
      context: {
        capabilityKind: input.kind,
        name: input.name,
        providerId: input.providerId,
        existingOwner: input.existingOwner ?? null,
      },
    });

    this.recordToolShortNameCollision(input.name, input.providerId, input.existingOwner);
  }

  private recordToolShortNameCollision(
    toolName: string,
    providerId: string,
    existingOwner: string | undefined,
  ): void {
    if (!existingOwner || existingOwner === providerId) {
      return;
    }
    const shortName = normalizeCapabilityShortName(toolName);
    const conflictingTool = Array.from(this.toolOwners.entries()).find(
      ([registeredTool, owner]) =>
        owner === existingOwner && normalizeCapabilityShortName(registeredTool) === shortName,
    );
    if (!conflictingTool) {
      return;
    }
    this.recordCapabilityDiagnostic('warn', {
      code: 'extension.capability.tool.short-name-collision',
      reason: 'conflicting-short-name',
      message: 'Capability tool short name conflicts with an existing provider tool.',
      context: {
        capabilityKind: 'tool',
        name: toolName,
        shortName,
        providerId,
        existingOwner,
        existingToolName: conflictingTool[0],
      },
    });
  }

  private recordToolShortNameRegistration(toolName: string, providerId: string): void {
    const shortName = normalizeCapabilityShortName(toolName);
    const existing = this.toolShortNameOwners.get(shortName);
    if (existing && existing.providerId !== providerId && existing.toolName !== toolName) {
      this.recordCapabilityDiagnostic('warn', {
        code: 'extension.capability.tool.short-name-collision',
        reason: 'conflicting-short-name',
        message: 'Capability tool short name conflicts with an existing provider tool.',
        context: {
          capabilityKind: 'tool',
          name: toolName,
          shortName,
          providerId,
          existingOwner: existing.providerId,
          existingToolName: existing.toolName,
        },
      });
    }
    this.toolShortNameOwners.set(shortName, { toolName, providerId });
  }

  private recordCapabilityDiagnostic(
    level: CapabilityDiagnosticLevel,
    diagnostic: CapabilityRuntimeDiagnostic,
  ): void {
    this.diagnostics.push(diagnostic);
    emitCapabilityDiagnostic(this.logger, level, diagnostic);
  }
}

function normalizeCapabilityShortName(name: string): string {
  const trimmed = name.trim();
  const tail = trimmed.split(/[.:/]/).filter(Boolean).at(-1) ?? trimmed;
  return tail.toLocaleLowerCase();
}

function resolveCapabilityProtocolInfo(
  providerId: string,
  metadata: {
    readonly trustLevel?: AgentCapabilityTrustLevel;
    readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
    readonly lifecycleHooks?: readonly AgentCapabilityLifecycleHook[];
  },
  source: 'provider' | 'manifest',
): CapabilityProtocolInfo {
  return {
    providerId,
    trustLevel: metadata.trustLevel ?? 'core',
    hostRequirements:
      metadata.hostRequirements && metadata.hostRequirements.length > 0
        ? metadata.hostRequirements
        : [{ host: 'desktop' }],
    lifecycleHooks: metadata.lifecycleHooks ?? [],
    source,
  };
}
