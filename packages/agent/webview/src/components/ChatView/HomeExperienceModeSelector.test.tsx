import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeExperienceModeSelector } from './HomeExperienceModeSelector';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chat.entryExperience.label': 'Choose an experience',
        'chat.entryExperience.mode.assistant': 'Assistant',
        'chat.entryExperience.mode.workspace': 'Workspace',
        'chat.entryExperience.mode.character': 'Character',
        'chat.entryExperience.mode.world': 'World',
      })[key] ?? key,
  }),
}));

describe('HomeExperienceModeSelector', () => {
  it('renders one accessible four-mode selector and reports the selected mode', () => {
    const onChange = vi.fn();
    render(
      <HomeExperienceModeSelector
        projection={{
          mode: 'assistant',
          options: [
            { mode: 'assistant', labelKey: 'chat.entryExperience.mode.assistant' },
            { mode: 'workspace', labelKey: 'chat.entryExperience.mode.workspace' },
            { mode: 'character', labelKey: 'chat.entryExperience.mode.character' },
            { mode: 'world', labelKey: 'chat.entryExperience.mode.world' },
          ],
          titleKey: 'title',
          descriptionKey: 'description',
          showWorkspaceControl: false,
          showSkillSuggestions: true,
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Choose an experience' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Assistant' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(onChange).toHaveBeenCalledWith('workspace');
  });

  it('keeps every mode visible while a binding change temporarily disables selection', () => {
    render(
      <HomeExperienceModeSelector
        projection={{
          mode: 'workspace',
          options: [
            { mode: 'assistant', labelKey: 'chat.entryExperience.mode.assistant' },
            { mode: 'workspace', labelKey: 'chat.entryExperience.mode.workspace' },
            { mode: 'character', labelKey: 'chat.entryExperience.mode.character' },
            { mode: 'world', labelKey: 'chat.entryExperience.mode.world' },
          ],
          titleKey: 'title',
          descriptionKey: 'description',
          submissionBlockedReasonKey: 'chat.entryExperience.validation.bindingPending',
          showWorkspaceControl: true,
          showSkillSuggestions: true,
        }}
        selectionPending
      />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveProperty('disabled', true);
  });
});
