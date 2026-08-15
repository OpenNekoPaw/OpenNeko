import { render, screen } from '@testing-library/react';
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
  'chat.emptyState.scope.workspaceActiveTitle': 'Start creating',
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

  it('projects the exact Draft scope as compact unboxed copy in the Desktop dock', () => {
    const view = render(<EmptyState draftScope="unbound" presentation="desktop-dock" />);

    const heading = screen.getByRole('heading', { name: 'Hi, create with chat' });
    expect(heading).toBeTruthy();
    expect(heading.className).toContain('text-[28px]');
    expect(heading.className).toContain('leading-9');
    expect(screen.queryByText('Describe an idea or mention a resource.')).toBeNull();
    expect(document.querySelector('.agent-entry-intro p')).toBeNull();
    expect(document.querySelector('.agent-empty-actions')).toBeNull();
    expect(document.querySelector('.agent-empty-panel')).toBeNull();
    expect(document.querySelector('.agent-empty-skill-button')).toBeNull();

    view.rerender(<EmptyState draftScope="workspace" presentation="desktop-dock" />);
    expect(screen.getByRole('heading', { name: 'Start creating' })).toBeTruthy();
  });

  it('renders only the centered mode title for a projected Entry', () => {
    render(
      <EmptyState
        experienceProjection={{
          mode: 'world-experience',
          options: [],
          titleKey: 'chat.entryExperience.worldExperience.title',
          descriptionKey: 'chat.entryExperience.worldExperience.description',
          showWorkspaceControl: false,
          showSkillSuggestions: false,
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'chat.entryExperience.worldExperience.title' }),
    ).toBeTruthy();
    expect(screen.queryByText('chat.entryExperience.worldExperience.description')).toBeNull();
    expect(screen.queryByText('AI responses may be inaccurate.')).toBeNull();
  });
});
