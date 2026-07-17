import { describe, expect, it } from 'vitest';
import {
  createSkillInvocationCatalog,
  createSlashCommandCatalog,
  createSlashCommandCatalogSections,
  extractSlashCommandArgs,
  filterSkillInvocations,
  filterSlashCommands,
  formatSkillInvocationHelpCatalog,
  formatSlashCommandHelpCatalog,
  resolveSlashCommandDescription,
  resolveSkillInvocationSourceLabel,
  resolveSlashCommandSourceLabel,
} from '../slash-command-catalog';

describe('slash-command-catalog', () => {
  it('builds a slash catalog with builtin and plugin commands', () => {
    const commands = createSlashCommandCatalog(
      [
        {
          id: 'commit-skill',
          name: 'Commit',
          description: 'Create a commit message',
          slashCommand: 'commit',
          tags: [],
          source: 'project',
          enabled: true,
        },
      ],
      [
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch render current selection',
          extensionId: 'neko.canvas',
        },
      ],
    );

    expect(commands.some((command) => command.name === '/help')).toBe(true);
    expect(commands.some((command) => command.source === 'command-artifact')).toBe(false);
    expect(commands).toContainEqual(
      expect.objectContaining({
        id: 'plugin:neko.canvas:batch',
        commandId: 'batch',
        name: '/batch',
        source: 'plugin',
      }),
    );
  });

  it('only exposes extension-available builtin commands in the webview catalog', () => {
    const commands = createSlashCommandCatalog();
    const names = commands.map((command) => command.name);

    expect(names).toContain('/help');
    expect(names).not.toContain('/as');
    expect(names).toContain('/exit-as');
    expect(names).toContain('/model');
    expect(names).not.toContain('/config');
    expect(names).not.toContain('/commands');
    expect(names).not.toContain('/migrate-tasks');
  });

  it('hides only the builtin /as command and leaves plugin slash commands visible', () => {
    const commands = createSlashCommandCatalog(
      [],
      [
        {
          id: 'as-plugin',
          name: '/as-plugin',
          description: 'Plugin command with similar prefix',
          extensionId: 'neko.test',
        },
      ],
    );

    expect(commands.map((command) => command.name)).not.toContain('/as');
    expect(commands).toContainEqual(
      expect.objectContaining({
        id: 'plugin:neko.test:as-plugin',
        name: '/as-plugin',
        source: 'plugin',
      }),
    );
  });

  it('keeps builtin commands canonical when skill or plugin names collide', () => {
    const commands = createSlashCommandCatalog(
      [
        {
          id: 'help-skill',
          name: 'Help Override',
          description: 'Should not replace builtin help',
          slashCommand: 'help',
          tags: [],
          source: 'project',
          enabled: true,
        },
      ],
      [
        {
          id: 'status',
          name: '/status',
          description: 'Plugin status override',
          extensionId: 'neko.canvas',
        },
      ],
    );

    expect(commands.filter((command) => command.name === '/help')).toHaveLength(1);
    expect(commands.filter((command) => command.name === '/status')).toHaveLength(1);

    const help = commands.find((command) => command.name === '/help');
    const status = commands.find((command) => command.name === '/status');

    expect(help?.source).toBe('builtin');
    expect(status?.source).toBe('builtin');
  });

  it('builds skill invocations for the dollar menu', () => {
    const commands = createSkillInvocationCatalog([
      {
        id: 'commit-skill',
        name: 'commit-skill',
        description: 'Create a commit message',
        slashCommand: 'commit',
        tags: [],
        source: 'project',
        enabled: true,
      },
      {
        id: 'disabled-skill',
        name: 'disabled-skill',
        description: 'Disabled skill',
        tags: [],
        source: 'project',
        enabled: false,
      },
    ]);

    expect(commands).toContainEqual(
      expect.objectContaining({
        id: 'commit-skill',
        skillName: 'commit-skill',
        name: '$commit-skill',
        source: 'project',
      }),
    );
    expect(commands.map((command) => command.id)).not.toContain('disabled-skill');
  });

  it('filters by translated builtin descriptions and literal dynamic descriptions', () => {
    const commands = createSlashCommandCatalog();
    const skillCommands = createSkillInvocationCatalog([
      {
        id: 'review-skill',
        name: 'review-skill',
        description: 'Review the current diff',
        slashCommand: 'review',
        tags: [],
        source: 'project',
        enabled: true,
      },
    ]);

    const translate = (key: string) =>
      key === 'chat.commands.skills' ? 'List and manage available skills' : key;

    const filteredBuiltin = filterSlashCommands(commands, 'manage available skills', translate);
    const filteredSkill = filterSkillInvocations(skillCommands, 'current diff', translate);

    expect(filteredBuiltin).toContainEqual(
      expect.objectContaining({
        name: '/skills',
      }),
    );
    expect(filteredSkill).toContainEqual(
      expect.objectContaining({
        name: '$review-skill',
      }),
    );
  });

  it('extracts args only when the typed slash command matches the selected command', () => {
    expect(
      extractSlashCommandArgs('/plan draft an implementation outline', {
        id: 'plan',
        commandId: 'plan',
        name: '/plan',
      }),
    ).toBe('draft an implementation outline');

    expect(
      extractSlashCommandArgs('/pla', {
        id: 'plan',
        commandId: 'plan',
        name: '/plan',
      }),
    ).toBeUndefined();

    expect(
      extractSlashCommandArgs('/batch render shots 1-4', {
        id: 'plugin:neko.canvas:batch',
        commandId: 'batch',
        name: '/batch',
      }),
    ).toBe('render shots 1-4');
  });

  it('resolves builtin descriptions through i18n and leaves dynamic descriptions untouched', () => {
    const builtin = createSlashCommandCatalog().find((command) => command.name === '/clear');
    const skill = createSkillInvocationCatalog([
      {
        id: 'commit-skill',
        name: 'commit-skill',
        description: 'Create a commit message',
        slashCommand: 'commit',
        tags: [],
        source: 'project',
        enabled: true,
      },
    ])[0];

    const translate = (key: string) =>
      key === 'chat.commands.clear' ? 'Clear conversation history' : key;

    expect(builtin).toBeDefined();
    expect(skill).toBeDefined();

    if (!builtin || !skill) {
      throw new Error('Expected builtin and skill commands to exist');
    }

    expect(resolveSlashCommandDescription(builtin, translate)).toBe('Clear conversation history');
    expect(resolveSlashCommandDescription(skill, translate)).toBe('Create a commit message');
  });

  it('builds stable help sections and source labels from the unified catalog', () => {
    const commands = createSlashCommandCatalog(
      [],
      [
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch render current selection',
          extensionId: 'neko.canvas',
        },
      ],
    );
    const sections = createSlashCommandCatalogSections(commands);

    expect(sections.map((section) => section.source)).toEqual(['builtin', 'plugin']);
    expect(
      formatSlashCommandHelpCatalog(commands, (key) => {
        if (key === 'chat.commands.help') return 'Show help message';
        if (key === 'chat.commands.help.availableCommands') return 'Available Commands';
        if (key === 'chat.commands.help.pluginCommands') return 'Plugin Commands';
        return key;
      }),
    ).toContain('- `/help` - Show help message');
    expect(formatSlashCommandHelpCatalog(commands, (key) => key)).not.toContain('`/as`');
    expect(
      resolveSlashCommandSourceLabel(commands.find((command) => command.name === '/help')!),
    ).toBeNull();
    expect(
      resolveSlashCommandSourceLabel(commands.find((command) => command.name === '/batch')!),
    ).toBe('plugin');
  });

  it('builds stable help and source labels for skill invocations', () => {
    const commands = createSkillInvocationCatalog([
      {
        id: 'commit-skill',
        name: 'commit-skill',
        description: 'Create a commit message',
        slashCommand: 'commit',
        tags: [],
        source: 'project',
        enabled: true,
      },
    ]);

    expect(formatSkillInvocationHelpCatalog(commands, (key) => key)).toContain(
      '- `$commit-skill` - Create a commit message',
    );
    expect(resolveSkillInvocationSourceLabel(commands[0]!)).toBe('project');
  });

  it('keeps help command keywords in English while localizing help headings and descriptions', () => {
    const commands = createSlashCommandCatalog();
    const help = formatSlashCommandHelpCatalog(commands, (key) => {
      if (key === 'chat.commands.help') return '显示帮助信息';
      if (key === 'chat.commands.help.availableCommands') return '可用命令';
      return key;
    });

    expect(help).toContain('**可用命令:**');
    expect(help).toContain('- `/help` - 显示帮助信息');
    expect(help).not.toContain('**Available Commands:**');
    expect(help).not.toContain('Show help message');
  });

  it('keeps skill keywords in English while localizing skill help headings', () => {
    const commands = createSkillInvocationCatalog([
      {
        id: 'quality-review',
        name: 'quality-review',
        description: '检查变更文件',
        tags: [],
        source: 'project',
        enabled: true,
      },
    ]);
    const help = formatSkillInvocationHelpCatalog(commands, (key) =>
      key === 'chat.commands.help.availableSkills' ? '可用技能' : key,
    );

    expect(help).toContain('**可用技能:**');
    expect(help).toContain('- `$quality-review` - 检查变更文件');
    expect(help).not.toContain('**Available Skills:**');
  });
});
