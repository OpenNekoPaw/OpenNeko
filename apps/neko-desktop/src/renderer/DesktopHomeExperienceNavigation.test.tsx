// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@neko/ui/i18n/react';
import { createDesktopI18n } from './i18n';
import {
  DesktopHomeExperienceNavigation,
  projectDesktopHomeExperienceIntent,
  projectDesktopHomeExperienceNavigation,
} from './DesktopHomeExperienceNavigation';

describe('DesktopHomeExperienceNavigation', () => {
  it('derives entry selection only from the authoritative Scene', () => {
    expect(
      projectDesktopHomeExperienceNavigation({
        kind: 'agent',
        agentViewId: 'agent-view:entry',
        scope: { kind: 'unbound', draftId: 'draft:entry' },
      }),
    ).toEqual({ selectedMode: 'assistant' });
    expect(projectDesktopHomeExperienceNavigation({ kind: 'project-management' })).toEqual({
      selectedMode: 'workspace',
    });
    expect(projectDesktopHomeExperienceNavigation({ kind: 'character-management' })).toEqual({
      selectedMode: 'character',
    });
    expect(
      projectDesktopHomeExperienceNavigation({
        kind: 'agent',
        agentViewId: 'agent-view:conversation',
        scope: {
          kind: 'assistant',
          draftId: 'draft:assistant',
          assistantSpaceId: 'assistant:default',
          conversationId: 'conversation:1',
        },
      }),
    ).toBeUndefined();
  });

  it('maps enabled modes to exact existing Scene intents and keeps World unavailable', () => {
    expect(projectDesktopHomeExperienceIntent('assistant')).toEqual({ kind: 'open-agent-entry' });
    expect(projectDesktopHomeExperienceIntent('workspace')).toEqual({
      kind: 'open-project-management',
    });
    expect(projectDesktopHomeExperienceIntent('character')).toEqual({
      kind: 'open-character-management',
    });
    expect(projectDesktopHomeExperienceIntent('world')).toBeUndefined();
  });

  it('navigates through a typed Scene intent and never activates disabled World', () => {
    const onNavigate = vi.fn();
    const service = createDesktopI18n('en');
    render(
      <I18nProvider service={service.i18nService}>
        <DesktopHomeExperienceNavigation
          onNavigate={onNavigate}
          projection={{ selectedMode: 'assistant' }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'open-project-management' });
    const worldTab = screen.getByRole('tab', { name: 'World' }) as HTMLButtonElement;
    expect(worldTab.disabled).toBe(true);
    fireEvent.click(worldTab);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
