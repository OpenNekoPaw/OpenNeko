import {
  TOOL_NAMES_SKILLS,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type CreateSkillInput,
  type CreateSkillResult,
  type CreateSkillTarget,
  type PortableSkillDefinition,
  type PromptFragment,
  type SkillResourceInput,
  type Tool,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';

export type CreateSkillPort = (input: {
  readonly request: CreateSkillInput;
  readonly signal?: AbortSignal;
}) => Promise<CreateSkillResult>;

export function createSkillCreationCapabilityProvider(input: {
  readonly source: CreateSkillTarget;
  readonly createSkill: CreateSkillPort;
}): AgentCapabilityProvider {
  return new SkillCreationCapabilityProvider(input);
}

class SkillCreationCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-skill-creation';
  readonly hostRequirements = [{ host: 'desktop' as const }];

  constructor(
    private readonly input: {
      readonly source: CreateSkillTarget;
      readonly createSkill: CreateSkillPort;
    },
  ) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-agent:skill-creation',
        priority: 72,
        toolNames: [TOOL_NAMES_SKILLS.CREATE_SKILL],
        content:
          'CreateSkill publishes one new portable Skill package to the destination owned by this Conversation. The Host fixes that destination; never request another scope or path. Use only necessary relative resources, never overwrite an existing package, and keep Host permission or Tool protocol out of portable Skill content.',
        locales: {
          zh: {
            content:
              'CreateSkill 只在当前会话拥有的位置发布一个新的可移植 Skill 包。目标由宿主固定，不得请求其他范围或路径。只添加必要的相对资源，不得覆盖现有包，也不得把宿主权限或 Tool 协议写入可移植 Skill 正文。',
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_SKILLS.CREATE_SKILL,
        description:
          'Create one new portable Skill package in the destination owned by this Conversation.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        parameters: CREATE_SKILL_PARAMETERS,
        execute: (args, options) => this.execute(args, options?.signal),
      },
    ];
  }

  private async execute(
    args: Readonly<Record<string, unknown>>,
    signal: AbortSignal | undefined,
  ): Promise<ToolResult> {
    try {
      const request = parseCreateSkillInput(args, this.input.source);
      const result = await this.input.createSkill({
        request,
        ...(signal ? { signal } : {}),
      });
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: `${TOOL_NAMES_SKILLS.CREATE_SKILL} failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

const STRING_ARRAY = { type: 'array' as const, items: { type: 'string' as const } };
const CREATE_SKILL_PARAMETERS: ToolParameters = {
  type: 'object',
  properties: {
    skill: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        body: { type: 'string' },
        license: { type: 'string' },
        compatibility: { type: 'string' },
        metadata: { type: 'object', additionalProperties: { type: 'string' } },
        allowedTools: STRING_ARRAY,
      },
      required: ['name', 'description', 'body'],
      additionalProperties: false,
    },
    resources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          encoding: { type: 'string', enum: ['utf8', 'base64'] },
          content: { type: 'string' },
        },
        required: ['path', 'encoding', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['skill'],
  additionalProperties: false,
};

function parseCreateSkillInput(
  args: Readonly<Record<string, unknown>>,
  target: CreateSkillTarget,
): CreateSkillInput {
  requireAllowedKeys(args, ['skill', 'resources']);
  return {
    target,
    skill: parsePortableSkillDefinition(args['skill']),
    ...(args['resources'] === undefined ? {} : { resources: parseResources(args['resources']) }),
  };
}

function parsePortableSkillDefinition(value: unknown): PortableSkillDefinition {
  const record = requireRecord(value, 'skill');
  requireAllowedKeys(record, [
    'name',
    'description',
    'body',
    'license',
    'compatibility',
    'metadata',
    'allowedTools',
  ]);
  return {
    name: requireText(record['name'], 'skill.name'),
    description: requireText(record['description'], 'skill.description'),
    body: requireText(record['body'], 'skill.body'),
    ...(record['license'] === undefined
      ? {}
      : { license: requireText(record['license'], 'skill.license') }),
    ...(record['compatibility'] === undefined
      ? {}
      : { compatibility: requireText(record['compatibility'], 'skill.compatibility') }),
    ...(record['metadata'] === undefined
      ? {}
      : { metadata: parseStringRecord(record['metadata'], 'skill.metadata') }),
    ...(record['allowedTools'] === undefined
      ? {}
      : { allowedTools: parseStringArray(record['allowedTools'], 'skill.allowedTools') }),
  };
}

function parseResources(value: unknown): readonly SkillResourceInput[] {
  if (!Array.isArray(value)) throw new Error('resources must be an array.');
  return value.map((item, index) => {
    const record = requireRecord(item, `resources[${index}]`);
    requireAllowedKeys(record, ['path', 'encoding', 'content']);
    const encoding = record['encoding'];
    if (encoding !== 'utf8' && encoding !== 'base64') {
      throw new Error(`resources[${index}].encoding is invalid.`);
    }
    return {
      path: requireText(record['path'], `resources[${index}].path`),
      encoding,
      content: requireString(record['content'], `resources[${index}].content`),
    };
  });
}

function parseStringRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  const record = requireRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, requireString(item, `${label}.${key}`)]),
  );
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => requireText(item, `${label}[${index}]`));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return Object.fromEntries(Object.entries(value));
}

function requireAllowedKeys(record: Readonly<Record<string, unknown>>, allowed: readonly string[]) {
  const unsupported = Object.keys(record).find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`Unsupported field '${unsupported}'.`);
}

function requireText(value: unknown, label: string): string {
  const text = requireString(value, label).trim();
  if (!text) throw new Error(`${label} must be non-empty.`);
  return text;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}
