import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'OpenNeko Creative Assistant',
  'chat.emptyState.description': 'Start from an idea or reference.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.desktopDockTitle': 'Hi, create with chat',
  'chat.emptyState.desktopDockDescription': 'Describe an idea or mention a resource.',
  'chat.emptyState.desktopDockSkills': 'Try a Skill',
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
  it('renders canonical entry copy without legacy action buttons', () => {
    render(<EmptyState />);

    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();
    expect(screen.getByText('Start from an idea or reference.')).toBeTruthy();
    expect(document.querySelector('.agent-empty-actions')).toBeNull();
    expect(document.querySelector('.agent-empty-state')?.className).toContain('items-center');
  });

  it('projects the exact Draft scope in the Desktop dock without owner choices', () => {
    const view = render(<EmptyState draftScope="unbound" presentation="desktop-dock" />);

    expect(screen.getByRole('heading', { name: 'Hi, create with chat' })).toBeTruthy();
    expect(document.querySelector('.agent-empty-actions')).toBeNull();

    view.rerender(<EmptyState draftScope="workspace" presentation="desktop-dock" />);
    expect(screen.getByRole('heading', { name: 'Workspace is ready' })).toBeTruthy();
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

    expect(document.querySelectorAll('.agent-empty-skill-button')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'disabled' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'e' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(onSkillSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'b' }));
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
    invocationKind: 'skill' as const,
  };
}
