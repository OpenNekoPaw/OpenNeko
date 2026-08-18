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
  readonly displayName: string;
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
  readonly displayName: string;
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

export interface GlobalCharacterCreationCapabilityPorts {
  createGlobal(input: {
    readonly proposal: CharacterCreationProposal;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly globalCharacter: {
      readonly globalCharacterId: string;
      readonly displayName: string;
      readonly currentCharacterVersionId: string;
    };
    readonly characterVersion: {
      readonly characterVersionId: string;
      readonly globalCharacterId: string;
    };
  }>;
}

export function createCharacterCreationProposal(
  input: CharacterCreationProposalInput,
): CharacterCreationProposal {
  const backgroundStory = createEmptyCharacterBackgroundStory();
  const originSetting = createEmptyCharacterOriginSetting();
  return {
    displayName: requireText(input.displayName, 'display_name'),
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

export function createGlobalCharacterCreationCapabilityProvider(
  createGlobal: GlobalCharacterCreationCapabilityPorts['createGlobal'],
): AgentCapabilityProvider {
  return new GlobalCharacterCreationCapabilityProvider({ createGlobal });
}

class GlobalCharacterCreationCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-global-character-creation';
  readonly hostRequirements = [{ host: 'desktop' as const }];

  constructor(private readonly ports: GlobalCharacterCreationCapabilityPorts) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-chara:global-creation',
        priority: 72,
        toolNames: [TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT],
        content:
          'Assistant Character creation commits one confirmed proposal directly as a global Character and its first immutable version. Separate source-backed facts from inferred suggestions, present the complete proposal with the pending global write, and treat the standard Tool approval as the single mutation confirmation. On success, describe the result as a global Character and use its display name; do not expose internal identities, version metadata, lifecycle labels, or field counts unless a diagnostic requires them. It never creates or infers a Project, workspace Character, synchronization link, runtime, Room, Storyline, memory, model, Skill, or Tool configuration fact.',
        locales: {
          zh: {
            content:
              '助手角色快创会把已确认的提案直接提交为全局角色及其首个不可变版本。必须区分素材事实与推断建议，展示完整提案和待执行的全局写入，并将标准 Tool 审批作为唯一变更确认。成功后应称为“全局角色”并使用角色显示名；除诊断需要外，不得展示内部 identity、版本元数据、生命周期标签或字段数量。不得创建或推断 Project、工作区角色、同步关系、运行时、Room、Storyline、记忆、模型、Skill 或 Tool 配置事实。',
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT,
        description:
          'Create a global Character and its first immutable version from a reviewed proposal.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        parameters: CREATION_PARAMETERS,
        execute: async (args, options): Promise<ToolResult> => {
          try {
            const proposal = createCharacterCreationProposal(parseProposalInput(args));
            const receipt = await this.ports.createGlobal({
              proposal,
              ...(options?.signal ? { signal: options.signal } : {}),
            });
            return {
              success: true,
              data: {
                placement: 'global',
                globalCharacterId: receipt.globalCharacter.globalCharacterId,
                characterVersionId: receipt.characterVersion.characterVersionId,
                displayName: receipt.globalCharacter.displayName,
                sourceFacts: proposal.sourceFacts,
                inferredSuggestions: proposal.inferredSuggestions,
              },
            };
          } catch (error) {
            return {
              success: false,
              error: `${TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT} failed: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      },
    ];
  }
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
        toolNames: [TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT],
        content:
          'Character authoring fills only the exact fresh workspace Character authorized for the current Conversation. Separate source-backed facts from inferred suggestions, present the complete proposal together with the pending workspace write, and treat the standard Tool approval as the single mutation confirmation without adding a text-confirmation gate. On success, describe the result as a workspace Character and use its display name; do not expose internal CharacterProject identity or draft lifecycle fields unless the user explicitly asks or a diagnostic requires them. When no exact CharacterProject authoring target is bound, return a proposal and state that the current Conversation has no writable workspace Character target; do not conflate this with global CharacterVersion synchronization or suggest that capability may appear later. It never synchronizes a CharacterVersion or creates runtime, Room, Storyline, memory, model, Skill, or Tool configuration facts.',
        locales: {
          zh: {
            content:
              '角色创作只填写当前会话已授权的精确全新工作区角色。必须区分素材事实与推断建议，先展示完整提案，再使用标准 Tool 审批执行工作区写入，不得增加文字确认门槛。成功后应称为“工作区角色”并使用角色显示名；除非用户明确询问或诊断需要，不得展示内部 CharacterProject identity 或草稿生命周期字段。未绑定精确 CharacterProject 创作目标时，只返回提案并明确当前会话没有可写工作区角色目标；不得把它与全局 CharacterVersion 同步混为一谈，也不得暗示能力稍后会自行出现。不得同步 CharacterVersion，也不得创建运行时、Room、Storyline、记忆、模型、Skill 或 Tool 配置事实。',
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
        'Create the exact selected fresh workspace Character from a user-reviewed character proposal.',
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
              placement: 'workspace',
              displayName: project.displayName,
              sourceFacts: proposal.sourceFacts,
              inferredSuggestions: proposal.inferredSuggestions,
              handoffs: createCharacterProductHandoffs({
                characterProjectId: project.characterProjectId,
                authoringAuthority: binding.authority,
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

const STRING_LIST = { type: 'array' as const, items: { type: 'string' as const } };

const CREATION_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    display_name: { type: 'string' },
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
    'display_name',
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
    displayName: requireText(args['display_name'], 'display_name'),
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
