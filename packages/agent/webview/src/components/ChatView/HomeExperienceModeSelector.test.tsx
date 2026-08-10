import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeExperienceModeSelector } from './HomeExperienceModeSelector';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chat.entryExperience.label': 'Choose a conversation mode',
        'chat.entryExperience.mode.assistant': 'Assistant',
        'chat.entryExperience.mode.workspace': 'Workspace',
        'chat.entryExperience.mode.character': 'Character',
        'chat.entryExperience.mode.world': 'World',
        'chat.entryExperience.validation.worldUnavailable': 'World is unavailable',
      })[key] ?? key,
  }),
}));

const options = [
  { mode: 'assistant' as const, labelKey: 'chat.entryExperience.mode.assistant', disabled: false },
  { mode: 'workspace' as const, labelKey: 'chat.entryExperience.mode.workspace', disabled: false },
  { mode: 'character' as const, labelKey: 'chat.entryExperience.mode.character', disabled: false },
  {
    mode: 'world' as const,
    labelKey: 'chat.entryExperience.mode.world',
    disabled: true,
    descriptionKey: 'chat.entryExperience.validation.worldUnavailable' as const,
  },
];

describe('HomeExperienceModeSelector', () => {
  it('changes Draft configuration without exposing a World action', () => {
    const onChange = vi.fn();
    render(
      <HomeExperienceModeSelector
        projection={{
          mode: 'assistant',
          options,
          titleKey: 'title',
          descriptionKey: 'description',
          showWorkspaceControl: false,
          showSkillSuggestions: true,
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Choose a conversation mode' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(onChange).toHaveBeenCalledWith('workspace');
    expect(screen.getByRole('tab', { name: 'World' })).toHaveProperty('disabled', true);
  });

  it('keeps the selected mode visible while binding is pending', () => {
    render(
      <HomeExperienceModeSelector
        projection={{
          mode: 'character',
          options,
          titleKey: 'title',
          descriptionKey: 'description',
          submissionBlockedReasonKey: 'chat.entryExperience.validation.bindingPending',
          showWorkspaceControl: false,
          showSkillSuggestions: false,
        }}
        selectionPending
      />,
    );

    expect(screen.getByRole('tab', { name: 'Character' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Assistant' })).toHaveProperty('disabled', true);
  });
});
