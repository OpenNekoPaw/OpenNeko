import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterDialogueTargetSelector } from './CharacterDialogueTargetSelector';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chat.entryExperience.characterDialogue.selectorLabel': 'Choose participants',
        'chat.entryExperience.characterDialogue.loading': 'Loading published Characters',
        'chat.entryExperience.characterDialogue.empty': 'No published Characters',
        'chat.entryExperience.characterDialogue.storylineLabel': 'Storyline',
        'chat.entryExperience.characterDialogue.storylineNone': 'No storyline',
        'chat.entryExperience.characterDialogue.modeLabel': 'Conversation mode',
        'chat.entryExperience.characterDialogue.modeDaily': 'Daily',
        'chat.entryExperience.characterDialogue.modeNarrative': 'Narrative',
        'chat.entryExperience.characterDialogue.modeNarrativeUnavailable':
          'Narrative configuration is not connected to this entry yet.',
        'chat.entryAction.label': 'Entry actions',
        'chat.entryAction.chooseCharacter': 'Choose Character',
        'chat.entryAction.singleCharacterDescription': 'Start Dialogue',
        'chat.entryAction.createRoom': 'Create Room',
        'chat.entryAction.createRoomDescription': 'Choose multiple Characters',
      })[key] ?? key,
  }),
}));

const targets = [
  {
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-a',
    displayName: 'A',
    versionLabel: 'Published A',
    storylines: [{ storylineVersionId: 'storyline-version-a', label: 'Arc A' }],
  },
  {
    characterProjectId: 'character-project-b',
    characterVersionId: 'character-version-b',
    displayName: 'B',
    versionLabel: 'Published B',
    storylines: [],
  },
] as const;

describe('CharacterDialogueTargetSelector', () => {
  it('shows explicit Daily and Narrative choices without external Composition claims', () => {
    const { rerender } = render(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={[
          {
            characterProjectId: 'character-project-a',
            characterVersionId: 'character-version-a',
            label: 'A',
          },
        ]}
        loading={false}
        pending={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Daily' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Narrative' }).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText('Narrative configuration is not connected to this entry yet.'),
    ).toBeTruthy();

    rerender(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={[
          {
            characterProjectId: 'character-project-a',
            characterVersionId: 'character-version-a',
            label: 'A',
          },
          {
            characterProjectId: 'character-project-b',
            characterVersionId: 'character-version-b',
            label: 'B',
          },
        ]}
        loading={false}
        pending={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Narrative' }).hasAttribute('disabled')).toBe(true);
  });

  it('selects exact Character versions for Dialogue and Room', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={[
          {
            characterProjectId: 'character-project-a',
            characterVersionId: 'character-version-a',
            label: 'A',
          },
        ]}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create Room/u }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByText('Published B').closest('button')!);
    expect(onChange).toHaveBeenCalledWith([
      {
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        label: 'A',
      },
      {
        characterProjectId: 'character-project-b',
        characterVersionId: 'character-version-b',
        label: 'B',
      },
    ]);

    rerender(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={[]}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Choose Character/u }));
    fireEvent.click(screen.getByText('Published A').closest('button')!);
    expect(onChange).toHaveBeenLastCalledWith([
      {
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        label: 'A',
      },
    ]);
  });

  it('shows a local empty state without disabling unrelated Entry modes', () => {
    render(
      <CharacterDialogueTargetSelector
        targets={[]}
        selected={[]}
        loading={false}
        pending={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('No published Characters')).toBeTruthy();
  });

  it('distinguishes loading from an authoritative empty catalog', () => {
    render(
      <CharacterDialogueTargetSelector
        targets={[]}
        selected={[]}
        loading
        pending
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading published Characters')).toBeTruthy();
    expect(screen.queryByText('No published Characters')).toBeNull();
  });
});
