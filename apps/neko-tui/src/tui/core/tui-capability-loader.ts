import { CapabilityRegistryRuntime } from '@neko/agent/runtime';
import { localizePromptFragment } from '@neko/shared';
import type {
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityHostRequirement,
  AgentCapabilityProvider,
  AgentCapabilityProviderAvailabilitySummary,
  AgentCapabilityRuntimeRequirements,
  AgentReferenceContributor,
  ArtifactProfileDescriptor,
  IArtifactProfileRegistry,
  IProviderCardRegistry,
  IProviderExpressionProfileRegistry,
  IToolRegistry,
  PromptFragment,
  ProviderCard,
  ProviderExpressionProfileDescriptor,
  Tool,
} from '@neko/shared';

const TUI_HOST = 'tui';

type RuntimeRequirementsContribution =
  | Tool
  | ProviderCard
  | ArtifactProfileDescriptor
  | ProviderExpressionProfileDescriptor;

interface ContributionWithRuntimeRequirements {
  readonly requirements?: AgentCapabilityRuntimeRequirements;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly metadata?: {
    readonly requirements?: AgentCapabilityRuntimeRequirements;
    readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  };
}

export interface TuiCapabilityLoaderOptions {
  readonly toolRegistry: IToolRegistry;
  readonly providerCardRegistry?: Pick<IProviderCardRegistry, 'register' | 'unregister'>;
  readonly artifactProfileRegistry?: Pick<IArtifactProfileRegistry, 'register' | 'unregister'>;
  readonly providerExpressionProfileRegistry?: Pick<
    IProviderExpressionProfileRegistry,
    'register' | 'unregister'
  >;
  readonly referenceContributors?: readonly AgentReferenceContributor[];
  readonly locale?: 'en' | 'zh';
}

export interface TuiCapabilityLoaderResult {
  readonly providers: readonly AgentCapabilityProviderAvailabilitySummary[];
  readonly diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[];
  readonly referenceContributors: readonly AgentReferenceContributor[];
  readonly promptFragments: readonly PromptFragment[];
}

export interface TuiCapabilityLoader {
  registerProviders(providers: readonly AgentCapabilityProvider[]): TuiCapabilityLoaderResult;
  getDiagnostics(): readonly AgentCapabilityAvailabilityDiagnostic[];
  getProviderSummaries(): readonly AgentCapabilityProviderAvailabilitySummary[];
  getReferenceContributors(): readonly AgentReferenceContributor[];
  getPromptFragments(): readonly PromptFragment[];
}

export function createTuiCapabilityLoader(
  options: TuiCapabilityLoaderOptions,
): TuiCapabilityLoader {
  return new DefaultTuiCapabilityLoader(options);
}

class DefaultTuiCapabilityLoader implements TuiCapabilityLoader {
  private readonly runtime: CapabilityRegistryRuntime;
  private readonly diagnostics: AgentCapabilityAvailabilityDiagnostic[] = [];
  private readonly providerSummaries: AgentCapabilityProviderAvailabilitySummary[] = [];
  private readonly referenceContributors: AgentReferenceContributor[];
  private readonly promptFragments: PromptFragment[] = [];

  constructor(private readonly options: TuiCapabilityLoaderOptions) {
    this.runtime = new CapabilityRegistryRuntime({
      toolRegistry: options.toolRegistry,
      ...(options.providerCardRegistry
        ? { providerCardRegistry: options.providerCardRegistry }
        : {}),
      ...(options.artifactProfileRegistry
        ? { artifactProfileRegistry: options.artifactProfileRegistry }
        : {}),
      ...(options.providerExpressionProfileRegistry
        ? { providerExpressionProfileRegistry: options.providerExpressionProfileRegistry }
        : {}),
    });
    this.referenceContributors = [...(options.referenceContributors ?? [])];
  }

  registerProviders(providers: readonly AgentCapabilityProvider[]): TuiCapabilityLoaderResult {
    for (const provider of providers) {
      this.registerProvider(provider);
    }
    return this.snapshot();
  }

  getDiagnostics(): readonly AgentCapabilityAvailabilityDiagnostic[] {
    return [...this.diagnostics];
  }

  getProviderSummaries(): readonly AgentCapabilityProviderAvailabilitySummary[] {
    return [...this.providerSummaries];
  }

  getReferenceContributors(): readonly AgentReferenceContributor[] {
    return [...this.referenceContributors];
  }

  getPromptFragments(): readonly PromptFragment[] {
    return [...this.promptFragments];
  }

  private registerProvider(provider: AgentCapabilityProvider): void {
    const providerSkip = getProviderSkipDiagnostic(provider);
    if (providerSkip) {
      this.recordProviderSummary(provider, [], [providerSkip]);
      this.diagnostics.push(providerSkip);
      return;
    }

    const context = {
      extensionContext: null,
      locale: this.options.locale ?? 'en',
    };
    const safeTools: Tool[] = [];
    const skipped: AgentCapabilityAvailabilityDiagnostic[] = [];
    const safeProviderCards = filterContributions({
      providerId: provider.id,
      kind: 'providerCard',
      contributions: provider.getProviderCards?.(context) ?? [],
      getName: formatProviderCardName,
      skipped,
      diagnostics: this.diagnostics,
    });
    const safeArtifactProfiles = filterContributions({
      providerId: provider.id,
      kind: 'artifactProfile',
      contributions: provider.getArtifactProfiles?.(context) ?? [],
      getName: formatProfileName,
      skipped,
      diagnostics: this.diagnostics,
    });
    const safeProviderExpressionProfiles = filterContributions({
      providerId: provider.id,
      kind: 'providerExpressionProfile',
      contributions: provider.getProviderExpressionProfiles?.(context) ?? [],
      getName: formatProfileName,
      skipped,
      diagnostics: this.diagnostics,
    });

    for (const tool of provider.getTools(context)) {
      const toolSkip = getToolSkipDiagnostic(provider.id, tool);
      if (toolSkip) {
        skipped.push(toolSkip);
        this.diagnostics.push(toolSkip);
      } else {
        safeTools.push(tool);
      }
    }

    const promptFragments = (provider.getPromptFragments?.(context) ?? []).map((fragment) =>
      localizePromptFragment(fragment, context.locale),
    );
    const referenceContributors = provider.getReferenceContributors?.(context) ?? [];
    const filteredProvider: AgentCapabilityProvider = {
      ...provider,
      getTools: () => safeTools,
      ...(provider.getProviderCards ? { getProviderCards: () => safeProviderCards } : {}),
      ...(provider.getArtifactProfiles ? { getArtifactProfiles: () => safeArtifactProfiles } : {}),
      ...(provider.getProviderExpressionProfiles
        ? { getProviderExpressionProfiles: () => safeProviderExpressionProfiles }
        : {}),
      ...(provider.getPromptFragments ? { getPromptFragments: () => promptFragments } : {}),
      ...(provider.getReferenceContributors
        ? { getReferenceContributors: () => referenceContributors }
        : {}),
    };

    this.runtime.registerProvider(filteredProvider, context);
    this.promptFragments.push(...promptFragments);
    this.referenceContributors.push(...referenceContributors);
    this.recordProviderSummary(
      provider,
      [
        ...safeTools.map((tool) => ({ kind: 'tool' as const, name: tool.name })),
        ...safeProviderCards.map((card) => ({
          kind: 'providerCard' as const,
          name: formatProviderCardName(card),
        })),
        ...safeArtifactProfiles.map((profile) => ({
          kind: 'artifactProfile' as const,
          name: formatProfileName(profile),
        })),
        ...safeProviderExpressionProfiles.map((profile) => ({
          kind: 'providerExpressionProfile' as const,
          name: formatProfileName(profile),
        })),
        ...promptFragments.map((fragment) => ({
          kind: 'promptFragment' as const,
          name: fragment.id,
        })),
        ...referenceContributors.map((contributor) => ({
          kind: 'referenceContributor' as const,
          name: contributor.id,
        })),
      ],
      skipped,
    );
  }

  private recordProviderSummary(
    provider: AgentCapabilityProvider,
    loaded: AgentCapabilityProviderAvailabilitySummary['loaded'],
    skipped: readonly AgentCapabilityAvailabilityDiagnostic[],
  ): void {
    this.providerSummaries.push({
      providerId: provider.id,
      version: provider.version,
      loaded,
      skipped,
    });
  }

  private snapshot(): TuiCapabilityLoaderResult {
    return {
      providers: this.getProviderSummaries(),
      diagnostics: this.getDiagnostics(),
      referenceContributors: this.getReferenceContributors(),
      promptFragments: this.getPromptFragments(),
    };
  }
}

function getProviderSkipDiagnostic(
  provider: AgentCapabilityProvider,
): AgentCapabilityAvailabilityDiagnostic | null {
  if (requiresVsCode(provider.requirements)) {
    return {
      level: 'warn',
      providerId: provider.id,
      contributionKind: 'provider',
      code: 'capability.provider.unavailable',
      reason: 'requires-vscode',
      message: `Provider "${provider.id}" is unavailable in TUI because it requires VSCode.`,
      requirement: 'vscode',
      host: TUI_HOST,
    };
  }

  if (supportsTuiOrCli(provider.hostRequirements)) {
    return null;
  }

  return {
    level: 'info',
    providerId: provider.id,
    contributionKind: 'provider',
    code: 'capability.provider.host-not-supported',
    reason: 'host-not-supported',
    message: `Provider "${provider.id}" is not declared as TUI-compatible.`,
    host: TUI_HOST,
  };
}

function getToolSkipDiagnostic(
  providerId: string,
  tool: Tool,
): AgentCapabilityAvailabilityDiagnostic | null {
  if (requiresVsCode(readContributionRequirements(tool))) {
    return {
      level: 'info',
      providerId,
      contributionKind: 'tool',
      contributionName: tool.name,
      code: 'capability.tool.unavailable',
      reason: 'requires-vscode',
      message: `Tool "${tool.name}" is unavailable in TUI because it requires VSCode.`,
      requirement: 'vscode',
      host: TUI_HOST,
    };
  }

  const hostRequirements = readContributionHostRequirements(tool);
  if (hostRequirements && !supportsTuiOrCli(hostRequirements)) {
    return createHostNotSupportedDiagnostic({
      providerId,
      kind: 'tool',
      name: tool.name,
    });
  }

  return null;
}

function filterContributions<TContribution extends RuntimeRequirementsContribution>(input: {
  readonly providerId: string;
  readonly kind: AgentCapabilityAvailabilityDiagnostic['contributionKind'];
  readonly contributions: readonly TContribution[];
  readonly getName: (contribution: TContribution) => string;
  readonly skipped: AgentCapabilityAvailabilityDiagnostic[];
  readonly diagnostics: AgentCapabilityAvailabilityDiagnostic[];
}): TContribution[] {
  const safe: TContribution[] = [];
  for (const contribution of input.contributions) {
    const requirements = readContributionRequirements(contribution);
    const hostRequirements = readContributionHostRequirements(contribution);
    if (requiresVsCode(requirements)) {
      const diagnostic = createRequiresVsCodeDiagnostic({
        providerId: input.providerId,
        kind: input.kind,
        name: input.getName(contribution),
      });
      input.skipped.push(diagnostic);
      input.diagnostics.push(diagnostic);
    } else if (hostRequirements && !supportsTuiOrCli(hostRequirements)) {
      const diagnostic = createHostNotSupportedDiagnostic({
        providerId: input.providerId,
        kind: input.kind,
        name: input.getName(contribution),
      });
      input.skipped.push(diagnostic);
      input.diagnostics.push(diagnostic);
    } else {
      safe.push(contribution);
    }
  }
  return safe;
}

function createRequiresVsCodeDiagnostic(input: {
  readonly providerId: string;
  readonly kind: AgentCapabilityAvailabilityDiagnostic['contributionKind'];
  readonly name: string;
}): AgentCapabilityAvailabilityDiagnostic {
  return {
    level: 'info',
    providerId: input.providerId,
    contributionKind: input.kind,
    contributionName: input.name,
    code: `capability.${input.kind}.unavailable`,
    reason: 'requires-vscode',
    message: `${input.kind} "${input.name}" is unavailable in TUI because it requires VSCode.`,
    requirement: 'vscode',
    host: TUI_HOST,
  };
}

function createHostNotSupportedDiagnostic(input: {
  readonly providerId: string;
  readonly kind: AgentCapabilityAvailabilityDiagnostic['contributionKind'];
  readonly name: string;
}): AgentCapabilityAvailabilityDiagnostic {
  return {
    level: 'info',
    providerId: input.providerId,
    contributionKind: input.kind,
    contributionName: input.name,
    code: `capability.${input.kind}.host-not-supported`,
    reason: 'host-not-supported',
    message: `${input.kind} "${input.name}" is not declared as TUI-compatible.`,
    host: TUI_HOST,
  };
}

function supportsTuiOrCli(
  hostRequirements: readonly AgentCapabilityHostRequirement[] | undefined,
): boolean {
  return (
    hostRequirements?.some(
      (requirement) => requirement.host === 'tui' || requirement.host === 'cli',
    ) ?? false
  );
}

function readContributionRequirements(
  contribution: RuntimeRequirementsContribution,
): AgentCapabilityRuntimeRequirements {
  const candidate = contribution as ContributionWithRuntimeRequirements;
  return candidate.requirements ?? candidate.metadata?.requirements ?? {};
}

function readContributionHostRequirements(
  contribution: RuntimeRequirementsContribution,
): readonly AgentCapabilityHostRequirement[] | undefined {
  const candidate = contribution as ContributionWithRuntimeRequirements;
  return candidate.hostRequirements ?? candidate.metadata?.hostRequirements;
}

function requiresVsCode(requirements: AgentCapabilityRuntimeRequirements | undefined): boolean {
  return requirements?.vscode === true;
}

function formatProviderCardName(card: ProviderCard): string {
  return card.modelId ? `${card.providerId}/${card.modelId}` : card.providerId;
}

function formatProfileName(
  profile: Pick<
    ArtifactProfileDescriptor | ProviderExpressionProfileDescriptor,
    'profileId' | 'version'
  >,
): string {
  return `${profile.profileId}@${String(profile.version)}`;
}
