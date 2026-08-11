import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HomeExperienceQuickActions } from './HomeExperienceQuickActions';

const entryStyles = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chat.entryQuickActions.label': 'Quick start',
        'chat.entryPanel.assistantTitle': 'Skills',
        'chat.entryPanel.authoringTitle': 'Projects, Characters, and Worlds',
        'chat.entryPanel.characterTitle': 'Characters and rooms',
      })[key] ?? key,
  }),
}));

describe('HomeExperienceQuickActions', () => {
  it('keeps mode switching out of the quick-action surface', () => {
    render(
      <HomeExperienceQuickActions
        mode="authoring"
        detailExpanded={false}
        onExpandedChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assistant' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Projects, Characters, and Worlds' })).toBeTruthy();
  });

  it('mounts owner detail only after its current-mode action is expanded', () => {
    const onExpandedChange = vi.fn();
    const view = render(
      <HomeExperienceQuickActions
        mode="authoring"
        detailExpanded
        summary="OpenNeko"
        onExpandedChange={onExpandedChange}
      >
        <div>Owner targets</div>
      </HomeExperienceQuickActions>,
    );

    expect(screen.getByText('Owner targets')).toBeTruthy();
    const action = screen.getByRole('button', {
      name: 'Projects, Characters, and Worlds: OpenNeko',
    });
    expect(action.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(action);
    expect(onExpandedChange).toHaveBeenCalledWith(false);

    view.rerender(
      <HomeExperienceQuickActions
        mode="authoring"
        detailExpanded={false}
        summary="OpenNeko"
        onExpandedChange={onExpandedChange}
      >
        <div>Owner targets</div>
      </HomeExperienceQuickActions>,
    );
    expect(screen.queryByText('Owner targets')).toBeNull();
  });

  it('shows catalog-backed global actions only on the Assistant Draft Entry', () => {
    const onSkillSelect = vi.fn();
    const skill = {
      id: 'storyboard',
      name: 'storyboard',
      description: 'Build a storyboard.',
      tags: [],
      source: 'builtin' as const,
      enabled: true,
      invocationKind: 'skill' as const,
    };
    const view = render(
      <HomeExperienceQuickActions
        mode="assistant"
        detailExpanded={false}
        skills={[skill]}
        onSkillSelect={onSkillSelect}
        onExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Skills' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'storyboard' })).toBeNull();
    view.rerender(
      <HomeExperienceQuickActions
        mode="assistant"
        detailExpanded
        skills={[skill]}
        onSkillSelect={onSkillSelect}
        onExpandedChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /storyboard/u }));
    expect(onSkillSelect).toHaveBeenCalledWith(skill);

    view.rerender(
      <HomeExperienceQuickActions
        mode="character-dialogue"
        detailExpanded={false}
        skills={[skill]}
        onExpandedChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'storyboard' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Characters and rooms' })).toBeTruthy();
  });

  it('omits unavailable World content instead of rendering a prompt', () => {
    const { container } = render(
      <HomeExperienceQuickActions
        mode="world-experience"
        detailExpanded={false}
        onExpandedChange={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('uses normal-flow wrapping and has no retained Overlay presentation path', () => {
    expect(entryStyles).not.toContain('.agent-entry-context-overlay');
    expect(entryStyles).not.toContain('.agent-entry-context-backdrop');
    expect(entryStyles).not.toContain('container-name: agent-entry');
    expect(ruleBody('.agent-entry-composition')).toContain('justify-content: safe center');
    expect(ruleBody('.agent-entry-composition')).toContain('overflow-y: auto');
    expect(ruleBody('.agent-entry-center-group')).toContain('flex-direction: column');
    expect(ruleBody('.agent-entry-resource-grid')).toContain(
      'repeat(auto-fit, minmax(min(210px, 100%), 1fr))',
    );
    expect(ruleBody('.agent-entry-authoring-actions')).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
    );
    expect(entryStyles).not.toContain('.agent-entry-project-target-grid');
    expect(entryStyles).not.toContain('.agent-entry-context-create');
    expect(ruleBody('.agent-entry-resource-card-media')).toContain('width: 36px');
    expect(ruleBody('.agent-entry-resource-card-media')).toContain('height: 36px');
    expect(ruleBody('.agent-entry-quick-detail')).not.toContain('position: absolute');
    expect(ruleBody('.agent-entry-quick-detail')).not.toContain('max-height');
  });
});

function ruleBody(selector: string): string {
  const selectorIndex = entryStyles.indexOf(selector);
  const bodyStart = entryStyles.indexOf('{', selectorIndex);
  const bodyEnd = entryStyles.indexOf('}', bodyStart);
  if (selectorIndex < 0 || bodyStart < 0 || bodyEnd < 0) {
    throw new Error(`CSS rule '${selector}' is missing.`);
  }
  return entryStyles.slice(bodyStart + 1, bodyEnd);
}
