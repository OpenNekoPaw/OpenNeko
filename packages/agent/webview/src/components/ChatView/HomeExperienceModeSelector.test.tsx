import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeExperienceModeSelector } from './HomeExperienceModeSelector';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chat.entryExperience.label': 'Choose a conversation mode',
        'chat.entryExperience.mode.assistant': 'Assistant',
        'chat.entryExperience.mode.authoring': 'Authoring',
        'chat.entryExperience.mode.characterDialogue': 'Character Dialogue',
        'chat.entryExperience.mode.worldExperience': 'World Experience',
        'chat.entryExperience.validation.characterUnavailable': 'Character is unavailable',
        'chat.entryExperience.validation.worldUnavailable': 'World is unavailable',
      })[key] ?? key,
  }),
}));

const options = [
  { mode: 'assistant' as const, labelKey: 'chat.entryExperience.mode.assistant', disabled: false },
  { mode: 'authoring' as const, labelKey: 'chat.entryExperience.mode.authoring', disabled: false },
  {
    mode: 'character-dialogue' as const,
    labelKey: 'chat.entryExperience.mode.characterDialogue',
    disabled: false,
    descriptionKey: 'chat.entryExperience.validation.characterUnavailable' as const,
  },
  {
    mode: 'world-experience' as const,
    labelKey: 'chat.entryExperience.mode.worldExperience',
    disabled: false,
    descriptionKey: 'chat.entryExperience.validation.worldUnavailable' as const,
  },
];

describe('HomeExperienceModeSelector', () => {
  it('changes Draft configuration among the four intent-qualified modes', () => {
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

    const tablist = screen.getByRole('tablist', { name: 'Choose a conversation mode' });
    expect(tablist).toBeTruthy();
    expect(tablist.style.maxWidth).toBe('480px');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Assistant' }).style.height).toBe('24px');
    expect(screen.getByRole('tab', { name: 'Assistant' }).style.fontSize).toBe('12px');
    fireEvent.click(screen.getByRole('tab', { name: 'Authoring' }));
    expect(onChange).toHaveBeenCalledWith('authoring');
  });

  it('keeps the selected mode visible while binding is pending', () => {
    render(
      <HomeExperienceModeSelector
        projection={{
          mode: 'character-dialogue',
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

    expect(
      screen.getByRole('tab', { name: 'Character Dialogue' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('tab', { name: 'Assistant' })).toHaveProperty('disabled', true);
  });

  it('keeps the final mode thumb inside the padded right boundary', () => {
    const { container } = render(
      <HomeExperienceModeSelector
        projection={{
          mode: 'world-experience',
          options,
          titleKey: 'title',
          descriptionKey: 'description',
          showWorkspaceControl: false,
          showSkillSuggestions: false,
        }}
      />,
    );

    const thumb = container.querySelector<HTMLElement>('.neko-segmented-control-thumb');
    expect(thumb?.style.left).toBe('2px');
    expect(thumb?.style.width).toBe('calc(0.25 * (100% - 4px))');
    expect(thumb?.style.transform).toBe('translateX(300%)');
  });
});
