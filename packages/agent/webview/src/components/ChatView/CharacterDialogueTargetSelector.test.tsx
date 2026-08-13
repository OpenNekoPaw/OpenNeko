import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CharacterDialogueTargetSelector } from './CharacterDialogueTargetSelector';

const entryStyles = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const value =
        {
          'chat.entryExperience.characterDialogue.selectorLabel': 'Choose participants',
          'chat.entryExperience.characterDialogue.loading': 'Loading published Characters',
          'chat.entryExperience.characterDialogue.empty': 'No published Characters',
          'chat.entryExperience.characterDialogue.selectExactVersion': 'Choose exact version',
          'chat.entryExperience.characterDialogue.versionLabel': 'Usable version',
          'chat.entryExperience.characterDialogue.versionForCharacter':
            'Usable version for {character}',
          'chat.entryExperience.characterDialogue.versionCount': '{count} usable versions',
          'chat.entryExperience.characterDialogue.head': 'Branch head',
          'chat.entryExperience.characterDialogue.unlinked': 'Unlinked',
          'chat.entryExperience.characterDialogue.lineageUnavailable': 'Lineage unavailable',
        }[key] ?? key;
      return Object.entries(params ?? {}).reduce(
        (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
        value,
      );
    },
  }),
}));

const targets = [
  {
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-a',
    displayName: 'A',
    versionLabel: 'Published A',
    lineage: {
      coverage: 'complete',
      state: 'declared-root',
      isHead: false,
      path: [{ characterVersionId: 'character-version-a', label: 'Published A' }],
    },
    storylines: [{ storylineVersionId: 'storyline-version-a', label: 'Arc A' }],
  },
  {
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-a-branch',
    displayName: 'A',
    versionLabel: 'Published A branch',
    lineage: {
      coverage: 'complete',
      state: 'linked',
      isHead: true,
      path: [
        { characterVersionId: 'character-version-a', label: 'Published A' },
        { characterVersionId: 'character-version-a-branch', label: 'Published A branch' },
      ],
    },
    storylines: [],
  },
  {
    characterProjectId: 'character-project-b',
    characterVersionId: 'character-version-b',
    displayName: 'B',
    versionLabel: 'Published B',
    lineage: {
      coverage: 'complete',
      state: 'unlinked',
      isHead: false,
      path: [{ characterVersionId: 'character-version-b', label: 'Published B' }],
    },
    storylines: [],
  },
] as const;

describe('CharacterDialogueTargetSelector', () => {
  it('uses the same fixed card grid as other Entry catalogs', () => {
    expect(ruleBody('.agent-entry-character-target-grid')).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
    );
    expect(entryStyles).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.agent-entry-character-target-grid[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u,
    );
    expect(entryStyles).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.agent-entry-character-target-grid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u,
    );
  });

  it('uses one multi-select whose participant count determines Dialogue or Room topology', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={[]}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole('button', { name: /Create Room/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Choose Character/u })).toBeNull();

    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.click(screen.getByText('A').closest('button')!);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Usable version for A' }), {
      target: { value: 'character-version-a-branch' },
    });
    const dialogueSelection = [
      {
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a-branch',
        label: 'A',
      },
    ];
    expect(onChange).toHaveBeenLastCalledWith(dialogueSelection);

    rerender(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={dialogueSelection}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('B').closest('button')!);
    const roomSelection = [
      ...dialogueSelection,
      {
        characterProjectId: 'character-project-b',
        characterVersionId: 'character-version-b',
        label: 'B',
      },
    ];
    expect(onChange).toHaveBeenLastCalledWith(roomSelection);

    rerender(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={roomSelection}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('A').closest('button')!);
    expect(onChange).toHaveBeenLastCalledWith([
      {
        characterProjectId: 'character-project-b',
        characterVersionId: 'character-version-b',
        label: 'B',
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

  it('replaces one Character exact version instead of adding a duplicate Room participant', () => {
    const onChange = vi.fn();
    const selected = [
      {
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a-branch',
        label: 'A',
      },
    ];
    render(
      <CharacterDialogueTargetSelector
        targets={targets}
        selected={selected}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Usable version for A' }), {
      target: { value: 'character-version-a' },
    });
    expect(onChange).toHaveBeenCalledWith([
      {
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        label: 'A',
      },
    ]);
    expect(
      screen.getByRole('option', { name: /Branch head · Published A \/ Published A branch/u }),
    ).toBeTruthy();
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

function ruleBody(selector: string): string {
  const selectorIndex = entryStyles.indexOf(selector);
  const bodyStart = entryStyles.indexOf('{', selectorIndex);
  const bodyEnd = entryStyles.indexOf('}', bodyStart);
  if (selectorIndex < 0 || bodyStart < 0 || bodyEnd < 0) {
    throw new Error(`CSS rule '${selector}' is missing.`);
  }
  return entryStyles.slice(bodyStart + 1, bodyEnd);
}
