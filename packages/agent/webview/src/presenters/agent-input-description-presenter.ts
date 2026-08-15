import type { BuiltinSlashCommandName } from '@neko/agent-contracts';

export type AgentInputDescriptionKind = 'i18n' | 'literal';

export interface AgentInputDescriptionProjection {
  readonly descriptionKey: string;
  readonly descriptionKind: AgentInputDescriptionKind;
}

const BUILTIN_COMMAND_DESCRIPTION_KEYS = {
  help: 'commandDescriptions.help',
  status: 'commandDescriptions.status',
  clear: 'commandDescriptions.clear',
  exit: 'commandDescriptions.exit',
  as: 'commandDescriptions.as',
  'exit-as': 'commandDescriptions.exit-as',
  new: 'commandDescriptions.new',
  resume: 'commandDescriptions.resume',
  config: 'commandDescriptions.config',
  model: 'commandDescriptions.model',
  settings: 'commandDescriptions.settings',
  permissions: 'commandDescriptions.permissions',
  init: 'commandDescriptions.init',
  compact: 'commandDescriptions.compact',
  plan: 'commandDescriptions.plan',
  skills: 'commandDescriptions.skills',
  commands: 'commandDescriptions.commands',
  tools: 'commandDescriptions.tools',
  mcp: 'commandDescriptions.mcp',
} as const satisfies Record<BuiltinSlashCommandName, string>;

const BUILTIN_SKILL_DESCRIPTION_KEYS = {
  'audio-mixing': 'skillDescriptions.audio-mixing',
  'character-creator': 'skillDescriptions.character-creator',
  'color-grading': 'skillDescriptions.color-grading',
  image: 'skillDescriptions.image',
  'media-production': 'skillDescriptions.media-production',
  'media-quality-review': 'skillDescriptions.media-quality-review',
  'scene-to-music': 'skillDescriptions.scene-to-music',
  'script-generation': 'skillDescriptions.script-generation',
  'script-to-timeline': 'skillDescriptions.script-to-timeline',
  'skill-creator': 'skillDescriptions.skill-creator',
  storyboard: 'skillDescriptions.storyboard',
  'subtitle-assistant': 'skillDescriptions.subtitle-assistant',
  video: 'skillDescriptions.video',
  'video-editing': 'skillDescriptions.video-editing',
  'world-creator': 'skillDescriptions.world-creator',
} as const;

export function projectCommandDescription(input: {
  readonly name: string;
  readonly canonicalDescription: string;
  readonly isOpenNekoBuiltin: boolean;
}): AgentInputDescriptionProjection {
  return projectDescription({
    ...input,
    keys: BUILTIN_COMMAND_DESCRIPTION_KEYS,
  });
}

export function projectSkillDescription(input: {
  readonly name: string;
  readonly canonicalDescription: string;
  readonly isOpenNekoBuiltin: boolean;
}): AgentInputDescriptionProjection {
  return projectDescription({
    ...input,
    keys: BUILTIN_SKILL_DESCRIPTION_KEYS,
  });
}

export function resolveAgentInputDescription(
  projection: AgentInputDescriptionProjection,
  translate: (key: string) => string,
): string {
  return projection.descriptionKind === 'i18n'
    ? translate(projection.descriptionKey)
    : projection.descriptionKey;
}

function projectDescription(input: {
  readonly name: string;
  readonly canonicalDescription: string;
  readonly isOpenNekoBuiltin: boolean;
  readonly keys: Readonly<Record<string, string>>;
}): AgentInputDescriptionProjection {
  if (!input.isOpenNekoBuiltin) {
    return literalDescription(input.canonicalDescription);
  }

  const descriptionKey = input.keys[input.name];
  return descriptionKey === undefined
    ? literalDescription(input.canonicalDescription)
    : { descriptionKey, descriptionKind: 'i18n' };
}

function literalDescription(descriptionKey: string): AgentInputDescriptionProjection {
  return { descriptionKey, descriptionKind: 'literal' };
}
