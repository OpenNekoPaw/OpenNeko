import {
  readAgentAuthoringBindingMetadata,
  TOOL_NAMES_CHARA,
  type AgentAuthoringBinding,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type PromptFragment,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  createCharacterProductHandoffs,
  parseCharacterDefinition,
  type CharacterDefinition,
  type CharacterProject,
} from '@neko/chara/contracts';

export interface CharacterCreationProposalInput {
  readonly summary: string;
  readonly backgroundOverview: string;
  readonly originOverview: string;
  readonly canon: readonly string[];
  readonly knowledgeBoundary: readonly string[];
  readonly behaviorPolicy: readonly string[];
  readonly expressionPolicy: readonly string[];
  readonly sourceFacts: readonly string[];
  readonly inferredSuggestions: readonly string[];
}

export interface CharacterCreationProposal {
  readonly draft: CharacterDefinition;
  readonly sourceFacts: readonly string[];
  readonly inferredSuggestions: readonly string[];
}

export interface CharacterAuthoringCapabilityPorts {
  proposeCreation(input: CharacterCreationProposalInput): CharacterCreationProposal;
  fillDraft(input: {
    readonly binding: AgentAuthoringBinding & {
      readonly target: { readonly kind: 'character-project'; readonly characterProjectId: string };
    };
    readonly proposal: CharacterCreationProposal;
    readonly signal?: AbortSignal;
  }): Promise<CharacterProject>;
}

export function createCharacterCreationProposal(
  input: CharacterCreationProposalInput,
): CharacterCreationProposal {
  const backgroundStory = createEmptyCharacterBackgroundStory();
  const originSetting = createEmptyCharacterOriginSetting();
  return {
    draft: parseCharacterDefinition({
      summary: requireText(input.summary, 'summary'),
      backgroundStory: {
        ...backgroundStory,
        overview: requireText(input.backgroundOverview, 'background_overview'),
      },
      originSetting: {
        ...originSetting,
        overview: requireText(input.originOverview, 'origin_overview'),
      },
      canon: requireTextList(input.canon, 'canon'),
      knowledgeBoundary: requireTextList(input.knowledgeBoundary, 'knowledge_boundary'),
      behaviorPolicy: requireTextList(input.behaviorPolicy, 'behavior_policy'),
      expressionPolicy: requireTextList(input.expressionPolicy, 'expression_policy'),
      representationRefs: [],
    }),
    sourceFacts: requireTextList(input.sourceFacts, 'source_facts'),
    inferredSuggestions: requireTextList(input.inferredSuggestions, 'inferred_suggestions'),
  };
}

export function createCharacterAuthoringCapabilityProvider(
  fillDraft: CharacterAuthoringCapabilityPorts['fillDraft'],
): AgentCapabilityProvider {
  return new CharacterAuthoringCapabilityProvider({
    proposeCreation: createCharacterCreationProposal,
    fillDraft,
  });
}

class CharacterAuthoringCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-chara-authoring';
  readonly hostRequirements = [{ host: 'desktop' as const }];
  readonly requirements = { writableProject: true } as const;

  constructor(private readonly ports: CharacterAuthoringCapabilityPorts) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-chara:authoring',
        priority: 72,
        content:
          'Character authoring fills only the exact CharacterProject draft authorized for the current Conversation. Separate source-backed facts from inferred suggestions, present the complete proposal together with the pending draft operation, and treat the standard Tool approval as the single mutation confirmation without adding a text-confirmation gate. When no exact CharacterProject authoring target is bound, return a proposal and state that the current Conversation has no writable Character draft target; do not conflate this with CharacterVersion publication or suggest that capability may appear later. It never publishes a CharacterVersion or creates runtime, Room, Storyline, memory, model, Skill, or Tool configuration facts.',
        locales: {
          zh: {
            content:
              '角色创作只填写当前会话已授权的精确 CharacterProject 草案。必须区分素材事实与推断建议，先展示完整提案，再使用标准 Tool 审批执行草案操作，不得增加文字确认门槛。未绑定精确 CharacterProject 创作目标时，只返回提案并明确当前会话没有可写角色草稿目标；不得把它与 CharacterVersion 定稿混为一谈，也不得暗示能力稍后会自行出现。不得创建 CharacterVersion、运行时、Room、Storyline、记忆、模型、Skill 或 Tool 配置事实。',
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [this.fillDraftTool()];
  }

  private fillDraftTool(): Tool {
    return {
      name: TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT,
      description:
        'Fill the exact selected fresh CharacterProject draft from a user-reviewed character creation proposal.',
      category: 'project',
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      requirements: { writableProject: true, authoringTargetKind: 'character-project' },
      parameters: CREATION_PARAMETERS,
      execute: async (args, options): Promise<ToolResult> => {
        try {
          const binding = readAgentAuthoringBindingMetadata(options?.metadata);
          if (binding.target.kind !== 'character-project') {
            throw new Error('Character creation requires an exact CharacterProject target.');
          }
          const proposal = this.ports.proposeCreation(parseProposalInput(args));
          const project = await this.ports.fillDraft({
            binding: { ...binding, target: binding.target },
            proposal,
            ...(options?.signal ? { signal: options.signal } : {}),
          });
          return {
            success: true,
            data: {
              characterProjectId: project.characterProjectId,
              reviewStatus: project.reviewStatus,
              sourceFacts: proposal.sourceFacts,
              inferredSuggestions: proposal.inferredSuggestions,
              handoffs: createCharacterProductHandoffs({
                characterProjectId: project.characterProjectId,
                authoringAuthority:
                  binding.authority.kind === 'content-project'
                    ? binding.authority
                    : requireStandaloneCharacterAuthority(binding.authority.library),
              }),
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `${TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT} failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }
}

function requireStandaloneCharacterAuthority(library: 'character' | 'world'): {
  readonly kind: 'standalone-library';
  readonly library: 'character';
} {
  if (library !== 'character') {
    throw new Error('Character creation cannot use the standalone World library.');
  }
  return { kind: 'standalone-library', library };
}

const STRING_LIST = { type: 'array' as const, items: { type: 'string' as const } };

const CREATION_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    background_overview: { type: 'string' },
    origin_overview: { type: 'string' },
    canon: STRING_LIST,
    knowledge_boundary: STRING_LIST,
    behavior_policy: STRING_LIST,
    expression_policy: STRING_LIST,
    source_facts: STRING_LIST,
    inferred_suggestions: STRING_LIST,
  },
  required: [
    'summary',
    'background_overview',
    'origin_overview',
    'canon',
    'knowledge_boundary',
    'behavior_policy',
    'expression_policy',
    'source_facts',
    'inferred_suggestions',
  ],
  additionalProperties: false,
};

function parseProposalInput(args: Record<string, unknown>): CharacterCreationProposalInput {
  return {
    summary: requireText(args['summary'], 'summary'),
    backgroundOverview: requireText(args['background_overview'], 'background_overview'),
    originOverview: requireText(args['origin_overview'], 'origin_overview'),
    canon: requireTextList(args['canon'], 'canon'),
    knowledgeBoundary: requireTextList(args['knowledge_boundary'], 'knowledge_boundary'),
    behaviorPolicy: requireTextList(args['behavior_policy'], 'behavior_policy'),
    expressionPolicy: requireTextList(args['expression_policy'], 'expression_policy'),
    sourceFacts: requireTextList(args['source_facts'], 'source_facts'),
    inferredSuggestions: requireTextList(args['inferred_suggestions'], 'inferred_suggestions'),
  };
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireTextList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => requireText(item, `${label}[${index}]`));
}
