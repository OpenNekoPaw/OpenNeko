import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'OpenNeko Creative Assistant',
  'chat.emptyState.description':
    'Start from an idea, reference, or character and develop story themes, relationships, worlds, and scene atmosphere with the Agent. Then continue into character images, scene references, video material, voice, sound effects, and ambience.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.entry.startChat': 'Start Chat',
  'chat.emptyState.entry.generateAssets': 'Generate Assets',
  'chat.emptyState.entry.roleplay': 'Roleplay',
  'chat.emptyState.entry.startChatHelper': 'Chat helper',
  'chat.emptyState.entry.generateAssetsHelper': 'Asset helper',
  'chat.emptyState.entry.roleplayHelper': 'Roleplay helper',
  'chat.emptyState.desktopDockTitle': 'Hi, create with chat',
  'chat.emptyState.desktopDockDescription': 'Describe an idea or mention a resource.',
  'chat.emptyState.desktopDockSkills': 'Try a Skill',
  'chat.emptyState.scope.title': 'Choose a creative space',
  'chat.emptyState.scope.description': 'Choose an owner.',
  'chat.emptyState.scope.assistant': 'Assistant',
  'chat.emptyState.scope.assistantHelper': 'Assistant helper',
  'chat.emptyState.scope.workspace': 'Workspace',
  'chat.emptyState.scope.workspaceHelper': 'Workspace helper',
  'chat.emptyState.scope.characterRoom': 'Character / Room',
  'chat.emptyState.scope.characterRoomHelper': 'Character helper',
  'chat.emptyState.scope.assistantActiveTitle': 'Assistant is ready',
  'chat.emptyState.scope.workspaceActiveTitle': 'Workspace is ready',
  'chat.emptyState.scope.activeDescription': 'Start a conversation.',
};

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('EmptyState', () => {
  it('renders the compact assistant entry points', () => {
    render(<EmptyState />);

    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();
    expect(
      screen.getByText(
        'Start from an idea, reference, or character and develop story themes, relationships, worlds, and scene atmosphere with the Agent. Then continue into character images, scene references, video material, voice, sound effects, and ambience.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start Chat/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate Assets/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Roleplay/ })).toBeTruthy();
    expect(screen.queryByText(/script|storyboard|shot description/i)).toBeNull();
    expect(document.querySelector('.agent-empty-state')).toBeTruthy();
    expect(document.querySelector('.agent-empty-state')?.className).toContain('items-center');
    expect(document.querySelector('.agent-empty-panel')?.className).toContain(
      'max-w-[min(920px,100%)]',
    );
    expect(document.querySelector('.agent-empty-panel')?.className).toContain('min-w-0');
    expect(document.querySelector('.agent-empty-copy')?.className).toContain('max-w-full');
    expect(document.querySelector('.agent-empty-actions')?.className).toContain('grid-cols-1');
    expect(document.querySelector('.agent-empty-actions')?.className).not.toContain(
      'sm:grid-cols-3',
    );
    expect(document.querySelectorAll('.agent-empty-action')).toHaveLength(3);
    expect(document.querySelector('.agent-empty-action')?.className).toContain('min-w-0');
    expect(document.querySelector('.agent-empty-action')?.className).toContain('justify-center');
    expect(document.querySelector('.agent-empty-action')?.className).toContain('text-center');
    expect(document.querySelector('.agent-empty-action')?.className).not.toContain('text-left');
    expect(screen.getByText('Chat helper')).toBeTruthy();
  });

  it('passes the selected entry action to the handler', () => {
    const onEntryAction = vi.fn();
    render(<EmptyState onEntryAction={onEntryAction} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));

    expect(onEntryAction).toHaveBeenCalledWith('generate-assets');
  });

  it('does not block an unbound Entry Draft with owner choices', () => {
    const view = render(<EmptyState draftScope="unbound" presentation="desktop-dock" />);

    expect(screen.getByRole('heading', { name: 'Hi, create with chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assistant' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Workspace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Character / Room' })).toBeNull();
    expect(document.querySelector('.agent-empty-actions')).toBeNull();

    view.rerender(<EmptyState draftScope="workspace" presentation="desktop-dock" />);
    expect(screen.getByRole('heading', { name: 'Workspace is ready' })).toBeTruthy();
    expect(document.querySelector('.agent-empty-actions')).toBeNull();
  });

  it('renders the selected entry helper', () => {
    render(<EmptyState selectedAction="roleplay" />);

    expect(screen.getByText('Roleplay helper')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Roleplay/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders at most four enabled catalog Skills in the Desktop dock', () => {
    const onSkillSelect = vi.fn();
    render(
      <EmptyState
        presentation="desktop-dock"
        skills={[
          skill('disabled', false),
          skill('a'),
          skill('b'),
          skill('c'),
          skill('d'),
          skill('e'),
        ]}
        onSkillSelect={onSkillSelect}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hi, create with chat' })).toBeTruthy();
    expect(screen.getByText('Describe an idea or mention a resource.')).toBeTruthy();
    expect(screen.getByText('Try a Skill')).toBeTruthy();
    expect(document.querySelectorAll('.agent-empty-skill-button')).toHaveLength(4);
    expect(document.querySelector('.agent-empty-state--desktop-dock')).toBeTruthy();
    expect(document.querySelector('.agent-empty-state--desktop-dock')?.className).toContain('px-3');
    expect(screen.queryByRole('button', { name: 'disabled' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'e' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(onSkillSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'b' }));
    expect(screen.queryByText('AI responses may be inaccurate.')).toBeNull();
  });

  it('does not fabricate Desktop Skill suggestions when none are enabled', () => {
    render(<EmptyState presentation="desktop-dock" skills={[skill('disabled', false)]} />);

    expect(screen.queryByText('Try a Skill')).toBeNull();
    expect(document.querySelector('.agent-empty-skill-button')).toBeNull();
  });
});

function skill(name: string, enabled = true) {
  return {
    id: name,
    name,
    description: `${name} description`,
    tags: [],
    source: 'project' as const,
    enabled,
  };
}
