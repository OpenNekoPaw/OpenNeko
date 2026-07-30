import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SkillInvocationMenu,
  SlashCommandMenu,
  projectSlashCommandGroup,
  sortSkillInvocationsForDisplay,
  sortSlashCommandsForDisplay,
} from './SlashCommandMenu';
import type { SkillInvocationCatalogItem, SlashCommandCatalogItem } from './slash-command-catalog';

const translations: Record<string, string> = {
  'chat.commands.help': 'Show help message',
  'chat.commands.sections.agent': 'Agent',
  'chat.commands.sections.creation': 'Creation',
  'chat.commands.sections.command': 'Commands',
  'chat.commands.sections.skill': 'Skills',
  'chat.commands.source.command': 'Command',
  'chat.commands.source.skill': 'Personal',
  'chat.commands.source.plugin': 'Plugin',
  'chat.commands.source.project': 'Project',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

function command(overrides: Partial<SlashCommandCatalogItem>): SlashCommandCatalogItem {
  return {
    id: 'help',
    commandId: 'help',
    name: '/help',
    descriptionKey: 'chat.commands.help',
    descriptionKind: 'i18n',
    icon: 'ICON_SHOULD_NOT_RENDER',
    source: 'builtin',
    ...overrides,
  };
}

describe('SlashCommandMenu', () => {
  it('renders codex-style command rows without command icons', () => {
    const { container } = render(
      <SlashCommandMenu
        isOpen
        commands={[
          command({ id: 'help', name: '/help' }),
          command({
            id: 'plugin:neko.canvas:storyboard',
            commandId: 'storyboard',
            name: '/storyboard',
            descriptionKey: 'Create a storyboard',
            descriptionKind: 'literal',
            icon: 'PLUGIN_ICON_SHOULD_NOT_RENDER',
            source: 'plugin',
          }),
        ]}
        selectedIndex={1}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const panel = container.firstElementChild as HTMLElement;

    expect(screen.queryByText('ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.queryByText('PLUGIN_ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.queryByText('SKILL_ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByText('Creation')).toBeTruthy();
    expect(screen.getByText('/help')).toBeTruthy();
    expect(screen.getByText('/storyboard')).toBeTruthy();
    expect(screen.getByText('Show help message')).toBeTruthy();
    expect(screen.getByText('Plugin')).toBeTruthy();
    expect(panel.className).toContain('agent-composer-popover');
    expect(panel.className).toContain('agent-composer-command-menu');
    expect(screen.getByRole('menu')).toBe(panel);

    const selectedButton = screen.getByRole('menuitem', { name: /\/storyboard/i });
    expect(selectedButton.className).toContain('agent-composer-popover-row');
    expect(selectedButton.className).toContain('agent-composer-command-row');
    expect(selectedButton.className).toContain('is-selected');
  });

  it('keeps display ordering aligned with keyboard selection groups', () => {
    const commands = [
      command({
        id: 'command:commit',
        commandId: 'commit',
        name: '/commit',
        descriptionKey: 'Create a commit message',
        descriptionKind: 'literal',
        source: 'command-artifact',
      }),
      command({
        id: 'plugin:neko.canvas:storyboard',
        commandId: 'storyboard',
        name: '/storyboard',
        descriptionKey: 'Create a storyboard',
        descriptionKind: 'literal',
        source: 'plugin',
      }),
      command({ id: 'help', commandId: 'help', name: '/help' }),
    ];

    expect(sortSlashCommandsForDisplay(commands).map((item) => item.name)).toEqual([
      '/help',
      '/storyboard',
      '/commit',
    ]);
    expect(projectSlashCommandGroup(commands[0]!)).toBe('command');
    expect(projectSlashCommandGroup(commands[1]!)).toBe('creation');
    expect(projectSlashCommandGroup(commands[2]!)).toBe('agent');
  });

  it('renders explicit skill invocations in the shared command menu presentation', () => {
    const onSelect = vi.fn();
    const skills: SkillInvocationCatalogItem[] = [
      {
        id: 'quality-review',
        skillName: 'quality-review',
        name: '$quality-review',
        descriptionKey: 'Review changed files',
        descriptionKind: 'literal',
        icon: 'SKILL_ICON_SHOULD_NOT_RENDER',
        source: 'project',
        enabled: true,
      },
    ];

    render(
      <SkillInvocationMenu
        isOpen
        skills={skills}
        selectedIndex={0}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('SKILL_ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('$quality-review')).toBeTruthy();
    expect(screen.getByText('Review changed files')).toBeTruthy();
    expect(screen.getByText('Project')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /\$quality-review/i }));
    expect(onSelect).toHaveBeenCalledWith(skills[0]);
    expect(sortSkillInvocationsForDisplay(skills)).toEqual(skills);
  });
});
