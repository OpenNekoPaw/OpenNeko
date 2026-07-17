import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import {
  createTuiSkillInvocationCatalog,
  createTuiSlashCommandCatalog,
  listTuiLocalCommandEffects,
} from '../slash-command-catalog';

describe('createTuiSlashCommandCatalog', () => {
  it('includes builtin slash commands by default', () => {
    const commands = createTuiSlashCommandCatalog(
      undefined,
      createTestAgentTerminalPresentation('en'),
    );
    const names = commands.map((command) => command.name);

    expect(names).toContain('help');
    expect(names).toContain('plan');
    expect(names).toContain('compact');
    expect(names).toContain('mode');
    expect(names).toContain('model');
    expect(names).toContain('media');
    expect(names).toContain('param');
    expect(names).toContain('queue');
    expect(names).toContain('mcp');
    expect(names).toContain('capability');
    expect(names).toContain('artifact');
    expect(names).toContain('auto');
    expect(names).toContain('ask');
    expect(names).toContain('skill');
    expect(names).not.toContain('idc');
  });

  it('adds enabled command artifacts and deduplicates builtin names', () => {
    const commands = createTuiSlashCommandCatalog(
      [
        {
          entryPointKind: 'command-artifact',
          command: 'commit',
          description: 'Create a commit message',
          enabled: true,
        },
        {
          entryPointKind: 'command-artifact',
          command: 'plan',
          description: 'Override builtin description',
          enabled: true,
        },
        {
          entryPointKind: 'command-artifact',
          command: 'draft-only',
          description: 'Disabled command should stay hidden',
          enabled: false,
        },
      ],
      createTestAgentTerminalPresentation('en'),
    );

    expect(commands).toContainEqual({
      name: 'commit',
      description: 'Create a commit message',
    });
    expect(commands.filter((command) => command.name === 'plan')).toHaveLength(1);
    expect(commands.some((command) => command.name === 'draft-only')).toBe(false);
  });

  it('localizes builtin and TUI-local command descriptions for Chinese autocomplete', () => {
    const commands = createTuiSlashCommandCatalog(
      undefined,
      createTestAgentTerminalPresentation('zh-cn'),
    );

    expect(commands).toContainEqual({
      name: 'help',
      description: '显示可用命令帮助',
    });
    expect(commands).toContainEqual({
      name: 'media',
      description: '列出或切换图像、视频、音频模型',
    });
    expect(commands.map((command) => command.description)).not.toContain(
      'Show help message with available commands',
    );
  });

  it('declares TUI-local command effects with explicit surface scope', () => {
    const localEffects = listTuiLocalCommandEffects(createTestAgentTerminalPresentation('en'));

    expect(localEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'model', surface: 'tui' }),
        expect.objectContaining({ name: 'queue', surface: 'tui' }),
        expect.objectContaining({ name: 'artifact', surface: 'tui' }),
      ]),
    );
    expect(localEffects.every((effect) => effect.surface === 'tui')).toBe(true);
  });

  it('projects ordinary skills and legacy aliases into the dollar catalog without slash entries', () => {
    const slashCommands = createTuiSlashCommandCatalog(
      [],
      createTestAgentTerminalPresentation('en'),
    );
    const skillCommands = createTuiSkillInvocationCatalog(
      [
        {
          name: 'quality-review',
          description: 'Review changed files',
          enabled: true,
        },
        {
          name: 'disabled-skill',
          description: 'Hidden',
          enabled: false,
        },
      ],
      createTestAgentTerminalPresentation('en'),
    );

    expect(slashCommands.some((command) => command.name === 'quality-review')).toBe(false);
    expect(skillCommands).toEqual([
      {
        name: '$quality-review',
        description: 'Review changed files',
      },
    ]);
  });

  it('keeps skill invocation keywords stable while localizing fallback descriptions', () => {
    const skillCommands = createTuiSkillInvocationCatalog(
      [
        {
          name: 'quality-review',
          enabled: true,
        },
      ],
      createTestAgentTerminalPresentation('zh-cn'),
    );

    expect(skillCommands).toEqual([
      {
        name: '$quality-review',
        description: '激活技能 quality-review',
      },
    ]);
  });
});
