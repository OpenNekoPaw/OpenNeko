import {
  listBuiltinSlashCommands,
  normalizeSlashCommandName,
  type BuiltinSlashCommandDefinition,
  type BuiltinSlashCommandName,
  type RegisteredPluginSlashCommand,
} from '@neko-agent/types';
import type { SkillSummary } from './types';

export type SlashCommandSource = 'builtin' | 'command-artifact' | 'plugin';
export type SlashCommandDescriptionKind = 'i18n' | 'literal';
export type SkillInvocationSource = SkillSummary['source'];

export interface SlashCommandCatalogItem {
  id: string;
  commandId?: string;
  name: string;
  descriptionKey: string;
  icon: string;
  source: SlashCommandSource;
  skillId?: string;
  extensionId?: string;
  descriptionKind: SlashCommandDescriptionKind;
}

export interface SkillInvocationCatalogItem {
  id: string;
  skillName: string;
  name: string;
  descriptionKey: string;
  icon: string;
  source: SkillInvocationSource;
  enabled: boolean;
  descriptionKind: SlashCommandDescriptionKind;
}

export interface SlashCommandCatalogSection {
  readonly source: SlashCommandSource;
  readonly title: string;
  readonly commands: readonly SlashCommandCatalogItem[];
}

export type SlashCommandTranslateFn = (key: string) => string;

const BUILTIN_COMMAND_ICONS: Record<BuiltinSlashCommandName, string> = {
  help: '❓',
  status: '📊',
  clear: '🗑️',
  exit: '🚪',
  as: '🎭',
  'exit-as': '🚪',
  new: '✨',
  resume: '▶️',
  config: '⚙️',
  model: '🤖',
  settings: '⚙️',
  permissions: '🔐',
  init: '🚀',
  compact: '📦',
  plan: '📐',
  skills: '🧠',
  commands: '⌨️',
  tools: '🛠️',
  tasks: '📋',
  mcp: '🔌',
};

const HIDDEN_WEBVIEW_BUILTIN_COMMANDS: ReadonlySet<BuiltinSlashCommandName> = new Set(['as']);

const BUILTIN_SLASH_COMMANDS: readonly SlashCommandCatalogItem[] = listBuiltinSlashCommands(
  'extension',
)
  .filter((command) => !HIDDEN_WEBVIEW_BUILTIN_COMMANDS.has(command.name))
  .map(projectBuiltinSlashCommand);

const SLASH_COMMAND_SECTION_ORDER: readonly SlashCommandSource[] = [
  'builtin',
  'command-artifact',
  'plugin',
];

const SLASH_COMMAND_SOURCE_LABELS: Record<SlashCommandSource, string | null> = {
  builtin: null,
  'command-artifact': 'command',
  plugin: 'plugin',
};

export function createSlashCommandCatalog(
  _skills: readonly SkillSummary[] = [],
  pluginCommands: readonly RegisteredPluginSlashCommand[] = [],
): SlashCommandCatalogItem[] {
  const commands = new Map<string, SlashCommandCatalogItem>();

  for (const command of BUILTIN_SLASH_COMMANDS) {
    registerCommand(commands, command);
  }

  for (const pluginCommand of pluginCommands) {
    registerCommand(commands, projectPluginSlashCommand(pluginCommand));
  }

  return Array.from(commands.values());
}

export function createSkillInvocationCatalog(
  skills: readonly SkillSummary[] = [],
): SkillInvocationCatalogItem[] {
  const entries = new Map<string, SkillInvocationCatalogItem>();
  for (const skill of skills) {
    const entry = projectSkillInvocation(skill);
    if (entry) {
      const key = normalizeSlashCommandName(entry.skillName);
      if (!entries.has(key)) {
        entries.set(key, entry);
      }
    }
  }
  return Array.from(entries.values());
}

export function createSlashCommandCatalogSections(
  commands: readonly SlashCommandCatalogItem[],
): SlashCommandCatalogSection[] {
  return SLASH_COMMAND_SECTION_ORDER.flatMap((source) => {
    const sectionCommands = commands.filter((command) => command.source === source);
    if (sectionCommands.length === 0) {
      return [];
    }

    return [
      {
        source,
        title: source,
        commands: sectionCommands,
      },
    ];
  });
}

export function resolveSlashCommandDescription(
  command: Pick<SlashCommandCatalogItem, 'descriptionKey' | 'descriptionKind'>,
  translate: SlashCommandTranslateFn,
): string {
  return command.descriptionKind === 'i18n'
    ? translate(command.descriptionKey)
    : command.descriptionKey;
}

export function resolveSlashCommandSourceLabel(
  command: Pick<SlashCommandCatalogItem, 'source'>,
): string | null {
  return SLASH_COMMAND_SOURCE_LABELS[command.source];
}

export function resolveSkillInvocationSourceLabel(
  command: Pick<SkillInvocationCatalogItem, 'source'>,
): string | null {
  return command.source;
}

export function formatSlashCommandHelpCatalog(
  commands: readonly SlashCommandCatalogItem[],
  translate: SlashCommandTranslateFn,
): string {
  return createSlashCommandCatalogSections(commands)
    .map((section) =>
      [
        `**${resolveSlashCommandHelpSectionTitle(section.source, translate)}:**`,
        ...section.commands.map(
          (entry) => `- \`${entry.name}\` - ${resolveSlashCommandDescription(entry, translate)}`,
        ),
      ].join('\n'),
    )
    .join('\n\n');
}

export function formatSkillInvocationHelpCatalog(
  commands: readonly SkillInvocationCatalogItem[],
  translate: SlashCommandTranslateFn,
): string {
  if (commands.length === 0) return '';
  const title = resolveSlashCommandHelpLabel(
    'chat.commands.help.availableSkills',
    'Available Skills',
    translate,
  );
  return [
    `**${title}:**`,
    ...commands.map(
      (entry) => `- \`${entry.name}\` - ${resolveSlashCommandDescription(entry, translate)}`,
    ),
  ].join('\n');
}

function resolveSlashCommandHelpSectionTitle(
  source: SlashCommandSource,
  translate: SlashCommandTranslateFn,
): string {
  if (source === 'command-artifact') {
    return resolveSlashCommandHelpLabel(
      'chat.commands.help.commandArtifacts',
      'Command Artifacts',
      translate,
    );
  }
  if (source === 'plugin') {
    return resolveSlashCommandHelpLabel(
      'chat.commands.help.pluginCommands',
      'Plugin Commands',
      translate,
    );
  }
  return resolveSlashCommandHelpLabel(
    'chat.commands.help.availableCommands',
    'Available Commands',
    translate,
  );
}

function resolveSlashCommandHelpLabel(
  key: string,
  fallback: string,
  translate: SlashCommandTranslateFn,
): string {
  const translated = translate(key);
  return translated === key ? fallback : translated;
}

export function filterSlashCommands(
  commands: readonly SlashCommandCatalogItem[],
  filter: string,
  translate: SlashCommandTranslateFn,
): SlashCommandCatalogItem[] {
  const normalizedFilter = normalizeSlashCommandName(filter);
  if (!normalizedFilter) {
    return [...commands];
  }

  return commands.filter((command) => {
    const nameMatch = normalizeSlashCommandName(command.name).includes(normalizedFilter);
    const description = resolveSlashCommandDescription(command, translate).toLowerCase();
    return nameMatch || description.includes(normalizedFilter);
  });
}

export function filterSkillInvocations(
  commands: readonly SkillInvocationCatalogItem[],
  filter: string,
  translate: SlashCommandTranslateFn,
): SkillInvocationCatalogItem[] {
  const normalizedFilter = normalizeSlashCommandName(filter);
  if (!normalizedFilter) {
    return [...commands];
  }

  return commands.filter((command) => {
    const nameMatch = normalizeSlashCommandName(command.name).includes(normalizedFilter);
    const skillNameMatch = normalizeSlashCommandName(command.skillName).includes(normalizedFilter);
    const description = resolveSlashCommandDescription(command, translate).toLowerCase();
    return nameMatch || skillNameMatch || description.includes(normalizedFilter);
  });
}

export function extractSlashCommandArgs(
  inputValue: string,
  command: Pick<SlashCommandCatalogItem, 'name' | 'commandId' | 'id'>,
): string | undefined {
  const trimmed = inputValue.trim();
  if (!trimmed.startsWith('/')) {
    return undefined;
  }

  const withoutPrefix = trimmed.slice(1);
  const separatorIndex = withoutPrefix.search(/\s/);
  const typedCommand =
    separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, Math.max(separatorIndex, 0));
  const normalizedTypedCommand = normalizeSlashCommandName(typedCommand);
  const acceptedCommands = new Set([
    normalizeSlashCommandName(command.name),
    normalizeSlashCommandName(command.commandId ?? command.id),
  ]);

  if (!acceptedCommands.has(normalizedTypedCommand)) {
    return undefined;
  }

  if (separatorIndex === -1) {
    return undefined;
  }

  const args = withoutPrefix.slice(separatorIndex + 1).trim();
  return args.length > 0 ? args : undefined;
}

function projectSkillInvocation(skill: SkillSummary): SkillInvocationCatalogItem | null {
  if (!skill.enabled) {
    return null;
  }

  return {
    id: skill.id,
    skillName: skill.name,
    name: `$${skill.name}`,
    descriptionKey: skill.description,
    icon: skill.icon || '🔧',
    source: skill.source,
    enabled: skill.enabled,
    descriptionKind: 'literal',
  };
}

function projectPluginSlashCommand(def: RegisteredPluginSlashCommand): SlashCommandCatalogItem {
  return {
    id: `plugin:${def.extensionId}:${def.id}`,
    commandId: def.id,
    name: def.name.startsWith('/') ? def.name : `/${def.name}`,
    descriptionKey: def.description,
    icon: def.icon || '🔌',
    source: 'plugin',
    extensionId: def.extensionId,
    descriptionKind: 'literal',
  };
}

function projectBuiltinSlashCommand(def: BuiltinSlashCommandDefinition): SlashCommandCatalogItem {
  return {
    id: def.name,
    commandId: def.name,
    name: `/${def.name}`,
    descriptionKey: `chat.commands.${def.name}`,
    icon: BUILTIN_COMMAND_ICONS[def.name],
    source: 'builtin',
    descriptionKind: 'i18n',
  };
}

function registerCommand(
  commands: Map<string, SlashCommandCatalogItem>,
  command: SlashCommandCatalogItem,
): void {
  const key = normalizeSlashCommandName(command.name);
  if (!commands.has(key)) {
    commands.set(key, command);
  }
}
