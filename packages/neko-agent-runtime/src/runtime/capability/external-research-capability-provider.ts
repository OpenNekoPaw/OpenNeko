import {
  createTool,
  createUnsupportedExternalResearchModeDiagnostic,
  isExternalResearchFetchInput,
  isExternalResearchFetchResult,
  isExternalResearchSearchInput,
  isExternalResearchSearchResult,
  normalizeExternalResearchConfig,
  type AgentCapabilityProvider,
  type ExternalResearchConfigInput,
  type ExternalResearchDiagnostic,
  type ExternalResearchFetchInput,
  type ExternalResearchProvider,
  type ExternalResearchSearchInput,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import { validateExternalResearchUrl } from './external-research-url-policy';

export const EXTERNAL_RESEARCH_CAPABILITY_PROVIDER_ID = 'external-research' as const;
export const WEB_SEARCH_TOOL_NAME = 'WebSearch' as const;
export const WEB_FETCH_TOOL_NAME = 'WebFetch' as const;

export interface ExternalResearchProviderResolver {
  resolve(providerId: string | undefined): ExternalResearchProvider | undefined;
}

export interface CreateExternalResearchCapabilityProviderOptions {
  readonly config?: ExternalResearchConfigInput;
  readonly providers: ExternalResearchProviderResolver;
  readonly diagnostics?: ExternalResearchDiagnostic[];
}

interface ResolvedExternalResearchCapability {
  readonly config: ReturnType<typeof normalizeExternalResearchConfig>;
  readonly provider?: ExternalResearchProvider;
  readonly diagnostics: readonly ExternalResearchDiagnostic[];
}

export function createExternalResearchCapabilityProvider(
  options: CreateExternalResearchCapabilityProviderOptions,
): AgentCapabilityProvider {
  const resolved = resolveExternalResearchCapability(options);

  return {
    id: EXTERNAL_RESEARCH_CAPABILITY_PROVIDER_ID,
    version: '0.1.0',
    trustLevel: 'core',
    hostRequirements: [{ host: 'tui' }, { host: 'cli' }, { host: 'vscode' }],
    getTools: () => createExternalResearchTools(resolved),
    getPromptFragments: () => [
      {
        id: 'external-research:usage-boundary',
        priority: 70,
        content:
          'External research is cited reference intake for creative work and developer lookup. Treat WebSearch/WebFetch results as session research material with source provenance. Do not present external research as a default model knowledge upgrade. Do not save sources into project memory, character settings, worldbuilding, entity metadata, asset metadata, or project files unless the user explicitly asks to save selected research as a ResearchNote or invokes a separate promotion workflow.',
        locales: {
          zh: {
            content:
              '外部研究只用于带来源的创作参考摄入和开发文档查询。将 WebSearch/WebFetch 结果视为带来源出处的会话研究材料，不要把它叙述成默认模型知识升级。除非用户明确要求把选中的研究保存为 ResearchNote，或调用独立的提升流程，否则不要把外部来源写入项目 memory、角色设定、世界观、实体元数据、资产元数据或项目文件。',
          },
        },
      },
    ],
  };
}

export function resolveExternalResearchCapability(
  options: CreateExternalResearchCapabilityProviderOptions,
): ResolvedExternalResearchCapability {
  const config = normalizeExternalResearchConfig(options.config);
  const diagnostics: ExternalResearchDiagnostic[] = [...(options.diagnostics ?? [])];

  if (config.mode === 'disabled') {
    return { config, diagnostics };
  }

  const provider = options.providers.resolve(config.providerId);
  if (!provider) {
    diagnostics.push({
      code: 'external-research.provider-missing',
      severity: 'error',
      message: 'External research is enabled but no provider resolved for this session.',
      mode: config.mode,
      ...(config.providerId !== undefined ? { providerId: config.providerId } : {}),
    });
    return { config, diagnostics };
  }

  if (config.mode === 'indexed' && !provider.capabilities.supportsIndexed) {
    diagnostics.push(
      createUnsupportedExternalResearchModeDiagnostic({
        mode: config.mode,
        providerId: provider.id,
      }),
    );
    return { config, provider, diagnostics };
  }

  if (config.mode === 'live' && !provider.capabilities.supportsLive) {
    diagnostics.push(
      createUnsupportedExternalResearchModeDiagnostic({
        mode: config.mode,
        providerId: provider.id,
      }),
    );
    return { config, provider, diagnostics };
  }

  if (
    (config.allowedDomains?.length || config.blockedDomains?.length) &&
    !provider.capabilities.supportsDomainFilters
  ) {
    diagnostics.push({
      code: 'external-research.provider-capability-missing',
      severity: 'error',
      message: 'External research domain policy requires provider-native domain filter support.',
      mode: config.mode,
      providerId: provider.id,
    });
    return { config, provider, diagnostics };
  }

  return { config, provider, diagnostics };
}

function createExternalResearchTools(resolved: ResolvedExternalResearchCapability): Tool[] {
  const { config, provider } = resolved;
  if (!provider || config.mode === 'disabled') {
    return [];
  }
  if (hasBlockingDiagnostics(resolved.diagnostics)) {
    return [];
  }

  const tools = [createWebSearchTool(config, provider)];
  if (config.mode === 'live') {
    tools.push(createWebFetchTool(config, provider));
  }
  return tools;
}

function createWebSearchTool(
  config: ReturnType<typeof normalizeExternalResearchConfig>,
  provider: ExternalResearchProvider,
): Tool {
  return createTool({
    name: WEB_SEARCH_TOOL_NAME,
    description:
      'Search external references and return cited sources without saving them to project memory.',
    category: 'analysis',
    safetyKind: 'read-only-query',
    isConcurrencySafe: true,
    isReadOnly: true,
    traits: {
      cost: 'cheap',
      reversible: true,
      locality: 'network',
      impactLevel: 'low',
    },
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The final user-visible research query.' },
        maxResults: { type: 'integer', description: 'Maximum number of cited sources to return.' },
        mode: { type: 'string', description: 'External research mode for approval display.' },
        providerId: {
          type: 'string',
          description: 'External research provider id for approval display.',
        },
      },
      required: ['query'],
    },
    execute: async (args, executionOptions) => {
      const input: ExternalResearchSearchInput = {
        query: readRequiredString(args, 'query'),
        mode: config.mode === 'live' ? 'live' : 'indexed',
        maxResults: readPositiveInteger(args['maxResults'], config.maxResults),
        ...(config.allowedDomains ? { allowedDomains: config.allowedDomains } : {}),
        ...(config.blockedDomains ? { blockedDomains: config.blockedDomains } : {}),
      };
      if (!isExternalResearchSearchInput(input)) {
        return failTool('Invalid WebSearch input.');
      }
      const result = await provider.search(input, toAbortSignal(executionOptions));
      if (!isExternalResearchSearchResult(result)) {
        return failTool('External research provider returned invalid search output.');
      }
      return { success: true, data: result };
    },
  });
}

function createWebFetchTool(
  config: ReturnType<typeof normalizeExternalResearchConfig>,
  provider: ExternalResearchProvider,
): Tool {
  return createTool({
    name: WEB_FETCH_TOOL_NAME,
    description:
      'Fetch one external URL for cited reference intake without saving it to project memory.',
    category: 'analysis',
    safetyKind: 'read-only-query',
    requiresConfirmation: config.requireApprovalForLive,
    isConcurrencySafe: true,
    isReadOnly: true,
    traits: {
      cost: 'cheap',
      reversible: true,
      locality: 'network',
      impactLevel: 'low',
    },
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The final user-visible URL to fetch.' },
        maxContentTokens: { type: 'integer', description: 'Maximum fetched content token budget.' },
        mode: { type: 'string', description: 'External research mode for approval display.' },
        providerId: {
          type: 'string',
          description: 'External research provider id for approval display.',
        },
        domain: { type: 'string', description: 'Final requested URL domain for approval display.' },
        allowedDomains: {
          type: 'array',
          description: 'Optional domains to constrain this fetch, further limited by config.',
          items: { type: 'string' },
        },
        blockedDomains: {
          type: 'array',
          description: 'Optional domains to block for this fetch, combined with config.',
          items: { type: 'string' },
        },
      },
      required: ['url'],
    },
    execute: async (args, executionOptions) => {
      const allowedDomains = mergeDomainLists(
        config.allowedDomains,
        readStringArray(args['allowedDomains']),
      );
      const blockedDomains = mergeDomainLists(
        config.blockedDomains,
        readStringArray(args['blockedDomains']),
      );
      const input: ExternalResearchFetchInput = {
        url: readRequiredString(args, 'url'),
        mode: 'live',
        maxContentTokens: readPositiveInteger(
          args['maxContentTokens'],
          config.maxFetchContentTokens,
        ),
        ...(allowedDomains ? { allowedDomains } : {}),
        ...(blockedDomains ? { blockedDomains } : {}),
      };
      if (!isExternalResearchFetchInput(input)) {
        return failTool('Invalid WebFetch input.');
      }
      const requestedUrlPolicy = validateExternalResearchUrl(input);
      if (!requestedUrlPolicy.ok) {
        return failTool(requestedUrlPolicy.reason ?? 'WebFetch URL is not allowed.');
      }
      const result = await provider.fetch(input, toAbortSignal(executionOptions));
      if (!isExternalResearchFetchResult(result)) {
        return failTool('External research provider returned invalid fetch output.');
      }
      const finalUrlPolicy = validateExternalResearchUrl({
        url: result.source.finalUrl ?? result.source.url,
        allowedDomains: input.allowedDomains,
        blockedDomains: input.blockedDomains,
      });
      if (!finalUrlPolicy.ok) {
        return failTool(finalUrlPolicy.reason ?? 'WebFetch final URL is not allowed.');
      }
      return { success: true, data: result };
    },
  });
}

function hasBlockingDiagnostics(diagnostics: readonly ExternalResearchDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function readRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function readStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function mergeDomainLists(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined,
): readonly string[] | undefined {
  const merged = [...(first ?? []), ...(second ?? [])];
  if (merged.length === 0) return undefined;
  return Array.from(new Set(merged));
}

function toAbortSignal(
  options: { readonly metadata?: Record<string, unknown> } | undefined,
): AbortSignal {
  const signal = options?.metadata?.['abortSignal'];
  return isAbortSignal(signal) ? signal : new AbortController().signal;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'aborted' in value &&
    typeof (value as { readonly aborted?: unknown }).aborted === 'boolean'
  );
}

function failTool(error: string): ToolResult {
  return { success: false, error };
}
