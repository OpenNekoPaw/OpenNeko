import {
  readAgentAuthoringBindingMetadata,
  TOOL_NAMES_WORLD,
  type AgentAuthoringBinding,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type PromptFragment,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';
import {
  parseWorldDefinition,
  parseWorldJsonValue,
  type WorldDefinition,
  type WorldJsonValue,
  type WorldProject,
  type WorldVisibility,
} from '@neko/world/contracts';

type WorldCreationVisibilityInput =
  | { readonly kind: 'public' }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'actors'; readonly actorIds: readonly string[] };

interface WorldCreationBookEntryInput {
  readonly worldBookEntryId: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly visibility: WorldCreationVisibilityInput;
}

interface WorldCreationNamedDefinitionInput {
  readonly definitionId: string;
  readonly name: string;
  readonly description: string;
}

interface WorldCreationRuleInput {
  readonly ruleId: string;
  readonly statement: string;
}

interface WorldCreationFactInput {
  readonly factId: string;
  readonly key: string;
  readonly value: WorldJsonValue;
  readonly visibility: WorldCreationVisibilityInput;
  readonly knownByActorIds: readonly string[];
}

export interface WorldCreationProposalInput {
  readonly title: string;
  readonly background: string;
  readonly worldBook: readonly WorldCreationBookEntryInput[];
  readonly locations: readonly WorldCreationNamedDefinitionInput[];
  readonly organizations: readonly WorldCreationNamedDefinitionInput[];
  readonly rules: readonly WorldCreationRuleInput[];
  readonly initialFacts: readonly WorldCreationFactInput[];
  readonly sourceFacts: readonly string[];
  readonly inferredSuggestions: readonly string[];
}

export interface WorldCreationProposal {
  readonly title: string;
  readonly draft: WorldDefinition;
  readonly sourceFacts: readonly string[];
  readonly inferredSuggestions: readonly string[];
}

export interface WorldAuthoringCapabilityPorts {
  proposeCreation(input: WorldCreationProposalInput): WorldCreationProposal;
  fillDraft(input: {
    readonly binding: AgentAuthoringBinding & {
      readonly target: { readonly kind: 'world-project'; readonly worldProjectId: string };
    };
    readonly proposal: WorldCreationProposal;
    readonly signal?: AbortSignal;
  }): Promise<WorldProject>;
}

export interface GlobalWorldCreationCapabilityPorts {
  createGlobal(input: {
    readonly proposal: WorldCreationProposal;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly globalWorld: {
      readonly globalWorldId: string;
      readonly title: string;
      readonly currentWorldVersionId: string;
    };
    readonly worldVersion: {
      readonly worldVersionId: string;
      readonly globalWorldId: string;
    };
  }>;
}

export function createWorldCreationProposal(
  input: WorldCreationProposalInput,
): WorldCreationProposal {
  return {
    title: requireText(input.title, 'title'),
    draft: parseWorldDefinition({
      background: requireText(input.background, 'background'),
      worldBook: input.worldBook.map((entry) => ({
        ...entry,
        sourceRefIds: [],
        visibility: parseVisibility(entry.visibility),
      })),
      locations: input.locations.map((location) => ({ ...location, sourceRefIds: [] })),
      organizations: input.organizations.map((organization) => ({
        ...organization,
        sourceRefIds: [],
      })),
      rules: input.rules.map((rule) => ({ ...rule, sourceRefIds: [] })),
      initialFacts: input.initialFacts.map((fact) => ({
        ...fact,
        visibility: parseVisibility(fact.visibility),
      })),
    }),
    sourceFacts: requireTextList(input.sourceFacts, 'source_facts'),
    inferredSuggestions: requireTextList(input.inferredSuggestions, 'inferred_suggestions'),
  };
}

export function createWorldAuthoringCapabilityProvider(
  fillDraft: WorldAuthoringCapabilityPorts['fillDraft'],
): AgentCapabilityProvider {
  return new WorldAuthoringCapabilityProvider({
    proposeCreation: createWorldCreationProposal,
    fillDraft,
  });
}

export function createGlobalWorldCreationCapabilityProvider(
  createGlobal: GlobalWorldCreationCapabilityPorts['createGlobal'],
): AgentCapabilityProvider {
  return new GlobalWorldCreationCapabilityProvider({ createGlobal });
}

class GlobalWorldCreationCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-global-world-creation';
  readonly hostRequirements = [{ host: 'desktop' as const }];

  constructor(private readonly ports: GlobalWorldCreationCapabilityPorts) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-world:global-creation',
        priority: 72,
        content:
          'Assistant World creation commits one confirmed proposal directly as a global World and its first immutable version. Separate source-backed facts from inferred suggestions, present the complete proposal with the pending global write, and treat the standard Tool approval as the single mutation confirmation. On success, describe the result as a global World and use its title; do not expose internal identities, version metadata, lifecycle labels, or field counts unless a diagnostic requires them. It never creates or infers a Project, workspace World, synchronization link, Run, Save, branch, event, Character, Room, Skill, or Tool configuration fact.',
        locales: {
          zh: {
            content:
              '助手世界快创会把已确认的提案直接提交为全局世界及其首个不可变版本。必须区分素材事实与推断建议，展示完整提案和待执行的全局写入，并将标准 Tool 审批作为唯一变更确认。成功后应称为“全局世界”并使用世界标题；除诊断需要外，不得展示内部 identity、版本元数据、生命周期标签或字段数量。不得创建或推断 Project、工作区世界、同步关系、Run、Save、分支、事件、角色、Room、Skill 或 Tool 配置事实。',
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_WORLD.FILL_WORLD_DRAFT,
        description:
          'Create a global World and its first immutable version from a reviewed proposal.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        parameters: CREATION_PARAMETERS,
        execute: async (args, options): Promise<ToolResult> => {
          try {
            const proposal = createWorldCreationProposal(parseProposalInput(args));
            const receipt = await this.ports.createGlobal({
              proposal,
              ...(options?.signal ? { signal: options.signal } : {}),
            });
            return {
              success: true,
              data: {
                placement: 'global',
                globalWorldId: receipt.globalWorld.globalWorldId,
                worldVersionId: receipt.worldVersion.worldVersionId,
                title: receipt.globalWorld.title,
                sourceFacts: proposal.sourceFacts,
                inferredSuggestions: proposal.inferredSuggestions,
              },
            };
          } catch (error) {
            return {
              success: false,
              error: `${TOOL_NAMES_WORLD.FILL_WORLD_DRAFT} failed: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      },
    ];
  }
}

class WorldAuthoringCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-world-authoring';
  readonly hostRequirements = [{ host: 'desktop' as const }];
  readonly requirements = { writableProject: true } as const;

  constructor(private readonly ports: WorldAuthoringCapabilityPorts) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-world:authoring',
        priority: 72,
        content:
          'World authoring fills only the exact fresh workspace World authorized for the current Conversation. Separate source-backed facts from inferred suggestions, present the complete proposal together with the pending workspace write, and treat the standard Tool approval as the single mutation confirmation without adding a text-confirmation gate. On success, describe the result as a workspace World and use its title; do not expose internal WorldProject identity or draft lifecycle fields unless the user explicitly asks or a diagnostic requires them. When no exact WorldProject authoring target is bound, return a proposal and state that the current Conversation has no writable workspace World target. It never synchronizes a WorldVersion or creates a Run, Save, branch, event, Character, Room, Skill, or Tool configuration fact.',
        locales: {
          zh: {
            content:
              '世界创作只填写当前会话已授权的精确全新工作区世界。必须区分素材事实与推断建议，先展示完整提案，再使用标准 Tool 审批执行工作区写入，不得增加文字确认门槛。成功后应称为“工作区世界”并使用世界标题；除非用户明确询问或诊断需要，不得展示内部 WorldProject identity 或草稿生命周期字段。未绑定精确 WorldProject 创作目标时，只返回提案并明确当前会话没有可写工作区世界目标。不得同步 WorldVersion，也不得创建 Run、Save、分支、事件、角色、Room、Skill 或 Tool 配置事实。',
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
      name: TOOL_NAMES_WORLD.FILL_WORLD_DRAFT,
      description:
        'Create the exact selected fresh workspace World from a user-reviewed world proposal.',
      category: 'project',
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      requirements: { writableProject: true, authoringTargetKind: 'world-project' },
      parameters: CREATION_PARAMETERS,
      execute: async (args, options): Promise<ToolResult> => {
        try {
          const binding = readAgentAuthoringBindingMetadata(options?.metadata);
          if (binding.target.kind !== 'world-project') {
            throw new Error('World creation requires an exact WorldProject target.');
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
              title: project.title,
              sourceFacts: proposal.sourceFacts,
              inferredSuggestions: proposal.inferredSuggestions,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `${TOOL_NAMES_WORLD.FILL_WORLD_DRAFT} failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }
}

const STRING_LIST = { type: 'array' as const, items: { type: 'string' as const } };
const VISIBILITY = {
  type: 'object' as const,
  properties: {
    kind: { type: 'string', enum: ['public', 'actors', 'hidden'] },
    actorIds: STRING_LIST,
  },
  required: ['kind'],
  additionalProperties: false,
};
const NAMED_DEFINITION = {
  type: 'object' as const,
  properties: {
    definitionId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['definitionId', 'name', 'description'],
  additionalProperties: false,
};

const CREATION_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    background: { type: 'string' },
    world_book: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          worldBookEntryId: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          tags: STRING_LIST,
          visibility: VISIBILITY,
        },
        required: ['worldBookEntryId', 'title', 'content', 'tags', 'visibility'],
        additionalProperties: false,
      },
    },
    locations: { type: 'array', items: NAMED_DEFINITION },
    organizations: { type: 'array', items: NAMED_DEFINITION },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
          statement: { type: 'string' },
        },
        required: ['ruleId', 'statement'],
        additionalProperties: false,
      },
    },
    initial_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          factId: { type: 'string' },
          key: { type: 'string' },
          value: {},
          visibility: VISIBILITY,
          knownByActorIds: STRING_LIST,
        },
        required: ['factId', 'key', 'value', 'visibility', 'knownByActorIds'],
        additionalProperties: false,
      },
    },
    source_facts: STRING_LIST,
    inferred_suggestions: STRING_LIST,
  },
  required: [
    'title',
    'background',
    'world_book',
    'locations',
    'organizations',
    'rules',
    'initial_facts',
    'source_facts',
    'inferred_suggestions',
  ],
  additionalProperties: false,
};

function parseProposalInput(args: Readonly<Record<string, unknown>>): WorldCreationProposalInput {
  requireAllowedKeys(
    args,
    [
      'title',
      'background',
      'world_book',
      'locations',
      'organizations',
      'rules',
      'initial_facts',
      'source_facts',
      'inferred_suggestions',
    ],
    'World creation proposal',
  );
  return {
    title: requireText(args['title'], 'title'),
    background: requireText(args['background'], 'background'),
    worldBook: requireArray(args['world_book'], parseWorldBookEntry, 'world_book'),
    locations: requireArray(args['locations'], parseNamedDefinition, 'locations'),
    organizations: requireArray(args['organizations'], parseNamedDefinition, 'organizations'),
    rules: requireArray(args['rules'], parseRule, 'rules'),
    initialFacts: requireArray(args['initial_facts'], parseFact, 'initial_facts'),
    sourceFacts: requireTextList(args['source_facts'], 'source_facts'),
    inferredSuggestions: requireTextList(args['inferred_suggestions'], 'inferred_suggestions'),
  };
}

function parseWorldBookEntry(value: unknown, label: string): WorldCreationBookEntryInput {
  const record = requireRecord(value, label);
  requireAllowedKeys(record, ['worldBookEntryId', 'title', 'content', 'tags', 'visibility'], label);
  return {
    worldBookEntryId: requireText(record['worldBookEntryId'], `${label}.worldBookEntryId`),
    title: requireText(record['title'], `${label}.title`),
    content: requireText(record['content'], `${label}.content`),
    tags: requireTextList(record['tags'], `${label}.tags`),
    visibility: parseVisibilityInput(record['visibility'], `${label}.visibility`),
  };
}

function parseNamedDefinition(value: unknown, label: string): WorldCreationNamedDefinitionInput {
  const record = requireRecord(value, label);
  requireAllowedKeys(record, ['definitionId', 'name', 'description'], label);
  return {
    definitionId: requireText(record['definitionId'], `${label}.definitionId`),
    name: requireText(record['name'], `${label}.name`),
    description: requireText(record['description'], `${label}.description`),
  };
}

function parseRule(value: unknown, label: string): WorldCreationRuleInput {
  const record = requireRecord(value, label);
  requireAllowedKeys(record, ['ruleId', 'statement'], label);
  return {
    ruleId: requireText(record['ruleId'], `${label}.ruleId`),
    statement: requireText(record['statement'], `${label}.statement`),
  };
}

function parseFact(value: unknown, label: string): WorldCreationFactInput {
  const record = requireRecord(value, label);
  requireAllowedKeys(record, ['factId', 'key', 'value', 'visibility', 'knownByActorIds'], label);
  return {
    factId: requireText(record['factId'], `${label}.factId`),
    key: requireText(record['key'], `${label}.key`),
    value: parseWorldJsonValue(record['value']),
    visibility: parseVisibilityInput(record['visibility'], `${label}.visibility`),
    knownByActorIds: requireTextList(record['knownByActorIds'], `${label}.knownByActorIds`),
  };
}

function parseVisibilityInput(value: unknown, label: string): WorldCreationVisibilityInput {
  const record = requireRecord(value, label);
  requireAllowedKeys(record, ['kind', 'actorIds'], label);
  const kind = requireText(record['kind'], `${label}.kind`);
  if (kind === 'public' || kind === 'hidden') {
    if (record['actorIds'] !== undefined) {
      throw new Error(`${label}.actorIds is allowed only for actors visibility.`);
    }
    return { kind };
  }
  if (kind === 'actors') {
    return { kind, actorIds: requireTextList(record['actorIds'], `${label}.actorIds`) };
  }
  throw new Error(`${label}.kind must be public, actors, or hidden.`);
}

function parseVisibility(value: WorldCreationVisibilityInput): WorldVisibility {
  return value.kind === 'actors'
    ? { kind: value.kind, actorIds: [...value.actorIds] }
    : { kind: value.kind };
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireAllowedKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  const unsupported = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unsupported.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unsupported.sort().join(', ')}.`);
  }
}

function requireArray<T>(
  value: unknown,
  parse: (item: unknown, label: string) => T,
  label: string,
): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => parse(item, `${label}[${index}]`));
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
