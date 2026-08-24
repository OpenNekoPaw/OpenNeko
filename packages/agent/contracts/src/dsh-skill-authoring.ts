export const CREATE_SKILL_DSH_TOOL_NAME = 'CreateSkill' as const;
export const CREATE_SKILL_DSH_TOOL_OPERATION = 'create' as const;

export const DSH_SKILL_AUTHORING_LAYOUTS = ['directory', 'flat'] as const;
export type DshSkillAuthoringLayout = (typeof DSH_SKILL_AUTHORING_LAYOUTS)[number];

export interface DshSkillAuthoringResourceInput {
  readonly path: string;
  readonly content: string;
}

export interface CreateDshSkillInput {
  readonly layout: DshSkillAuthoringLayout;
  readonly skillMarkdown: string;
  readonly resources: readonly DshSkillAuthoringResourceInput[];
}

export type CreateDshSkillResult =
  | {
      readonly status: 'ready';
      readonly name: string;
      readonly layout: DshSkillAuthoringLayout;
      readonly source: string;
      readonly provider: string;
    }
  | {
      readonly status: 'created-shadowed';
      readonly name: string;
      readonly layout: DshSkillAuthoringLayout;
      readonly source: string;
      readonly provider: string;
    }
  | {
      readonly status: 'created-pending-discovery';
      readonly name: string;
      readonly layout: DshSkillAuthoringLayout;
    };

export const CREATE_SKILL_DSH_TOOL_PARAMETERS = {
  layout: {
    type: 'string',
    enum: [...DSH_SKILL_AUTHORING_LAYOUTS],
    description:
      'Use directory for <name>/SKILL.md resources or flat for <name>.md with shared-directory resources.',
    required: true,
  },
  skillMarkdown: {
    type: 'string',
    description: 'Complete DSH Skill Markdown including native YAML frontmatter.',
    required: true,
  },
  resources: {
    type: 'array',
    description: 'Optional UTF-8 resources addressed by safe package-relative paths.',
    items: {
      type: 'object',
      properties: {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true },
      },
      additionalProperties: false,
    },
  },
} as const;

export function decodeCreateDshSkillInput(value: unknown): CreateDshSkillInput {
  const record = requireRecord(value, 'CreateSkill input');
  requireExactKeys(record, ['layout', 'skillMarkdown', 'resources'], 'CreateSkill input');
  const resources = record.resources;
  if (resources !== undefined && !Array.isArray(resources)) {
    throw new Error('CreateSkill resources must be an array.');
  }
  return {
    layout: requireLayout(record.layout),
    skillMarkdown: requireNonEmptyString(record.skillMarkdown, 'CreateSkill skillMarkdown'),
    resources: (resources ?? []).map((resource, index) => {
      const item = requireRecord(resource, `CreateSkill resources[${index}]`);
      requireExactKeys(item, ['path', 'content'], `CreateSkill resources[${index}]`);
      return {
        path: requireNonEmptyString(item.path, `CreateSkill resources[${index}].path`),
        content: requireString(item.content, `CreateSkill resources[${index}].content`),
      };
    }),
  };
}

export function decodeCreateDshSkillResult(value: unknown): CreateDshSkillResult {
  const record = requireRecord(value, 'CreateSkill result');
  if (record.status === 'ready') {
    requireExactKeys(
      record,
      ['status', 'name', 'layout', 'source', 'provider'],
      'CreateSkill ready result',
    );
    return {
      status: 'ready',
      name: requireNonEmptyString(record.name, 'CreateSkill result name'),
      layout: requireLayout(record.layout),
      source: requireNonEmptyString(record.source, 'CreateSkill result source'),
      provider: requireNonEmptyString(record.provider, 'CreateSkill result provider'),
    };
  }
  if (record.status === 'created-pending-discovery') {
    requireExactKeys(record, ['status', 'name', 'layout'], 'CreateSkill pending result');
    return {
      status: 'created-pending-discovery',
      name: requireNonEmptyString(record.name, 'CreateSkill result name'),
      layout: requireLayout(record.layout),
    };
  }
  if (record.status === 'created-shadowed') {
    requireExactKeys(
      record,
      ['status', 'name', 'layout', 'source', 'provider'],
      'CreateSkill shadowed result',
    );
    return {
      status: 'created-shadowed',
      name: requireNonEmptyString(record.name, 'CreateSkill result name'),
      layout: requireLayout(record.layout),
      source: requireNonEmptyString(record.source, 'CreateSkill result source'),
      provider: requireNonEmptyString(record.provider, 'CreateSkill result provider'),
    };
  }
  throw new Error('CreateSkill result status is invalid.');
}

function requireLayout(value: unknown): DshSkillAuthoringLayout {
  if (value === 'directory' || value === 'flat') return value;
  throw new Error('CreateSkill layout must be directory or flat.');
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value);
  const required = allowed.filter((key) => key !== 'resources');
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (result.trim().length === 0) throw new Error(`${label} must be non-empty.`);
  return result;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}
