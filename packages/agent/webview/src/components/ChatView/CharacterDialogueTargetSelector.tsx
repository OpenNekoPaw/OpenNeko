import { useEffect, useState } from 'react';
import type { AgentCharacterDialogueTargetOption } from '@neko/agent-contracts';
import { SegmentedControl } from '@neko/ui';
import { UserIcon, UsersIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';
import type { SelectedCharacterLaunch } from './InputArea/types';
import { EntryResourceCard } from './EntryResourceCard';

export interface CharacterDialogueTargetSelectorProps {
  readonly targets: readonly AgentCharacterDialogueTargetOption[];
  readonly selected: readonly SelectedCharacterLaunch[];
  readonly loading: boolean;
  readonly pending: boolean;
  readonly onChange: (selected: readonly SelectedCharacterLaunch[]) => void;
}

export function CharacterDialogueTargetSelector({
  targets,
  selected,
  loading,
  pending,
  onChange,
}: CharacterDialogueTargetSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const [selectionKind, setSelectionKind] = useState<'character' | 'room'>(() =>
    selected.length > 1 ? 'room' : 'character',
  );
  const [roomParticipants, setRoomParticipants] = useState<readonly SelectedCharacterLaunch[]>(
    () => (selected.length > 1 ? selected : []),
  );
  useEffect(() => {
    if (selected.length > 1) {
      setRoomParticipants(selected);
    } else if (selectionKind === 'character') {
      setRoomParticipants([]);
    }
  }, [selected, selectionKind]);
  const activeSelection = selectionKind === 'room' ? roomParticipants : selected;
  const selectedIds = new Set(activeSelection.map((item) => item.characterVersionId));
  const selectedTarget =
    selected.length === 1
      ? targets.find((target) => target.characterVersionId === selected[0]?.characterVersionId)
      : undefined;

  return (
    <section
      className="agent-entry-character-selector"
      aria-label={t('chat.entryExperience.characterDialogue.selectorLabel')}
      data-character-dialogue-target-selector="true"
    >
      <div className="agent-entry-character-mode-section">
        <span className="agent-entry-character-mode-label">
          {t('chat.entryExperience.characterDialogue.modeLabel')}
        </span>
        <SegmentedControl
          appearance="neutral"
          className="agent-entry-character-mode-switch"
          label={t('chat.entryExperience.characterDialogue.modeLabel')}
          maxWidth="none"
          value="daily"
          options={[
            {
              value: 'daily',
              label: t('chat.entryExperience.characterDialogue.modeDaily'),
              disabled: pending,
            },
            {
              value: 'narrative',
              label: t('chat.entryExperience.characterDialogue.modeNarrative'),
              description: t('chat.entryExperience.characterDialogue.modeNarrativeUnavailable'),
              disabled: true,
            },
          ]}
          onValueChange={(value) => {
            if (value !== 'daily') {
              throw new Error('Narrative Character runtime owner is not composed.');
            }
          }}
        />
        <small className="agent-entry-character-mode-diagnostic">
          {t('chat.entryExperience.characterDialogue.modeNarrativeUnavailable')}
        </small>
      </div>

      <div className="agent-entry-resource-grid" aria-label={t('chat.entryAction.label')}>
        <EntryResourceCard
          actionId="choose-character"
          label={t('chat.entryAction.chooseCharacter')}
          description={t('chat.entryAction.singleCharacterDescription')}
          media={<UserIcon size={18} />}
          selected={selectionKind === 'character'}
          disabled={pending}
          onSelect={() => {
            setSelectionKind('character');
            setRoomParticipants([]);
            if (selected.length > 1) onChange([]);
          }}
        />
        <EntryResourceCard
          actionId="create-room"
          label={t('chat.entryAction.createRoom')}
          description={t('chat.entryAction.createRoomDescription')}
          media={<UsersIcon size={18} />}
          selected={selectionKind === 'room'}
          disabled={pending}
          onSelect={() => {
            setSelectionKind('room');
            const nextParticipants = selected.map(
              ({ characterStorylineVersionId: _storyline, ...participant }) => participant,
            );
            setRoomParticipants(nextParticipants);
            if (selected.length < 2) onChange([]);
          }}
        />
      </div>

      {loading ? (
        <div className="agent-entry-context-status" role="status">
          {t('chat.entryExperience.characterDialogue.loading')}
        </div>
      ) : targets.length === 0 ? (
        <div className="agent-entry-context-status">
          {t('chat.entryExperience.characterDialogue.empty')}
        </div>
      ) : (
        <div className="agent-entry-resource-grid agent-entry-character-target-grid" role="group">
          {targets.map((target) => {
            const active = selectedIds.has(target.characterVersionId);
            return (
              <EntryResourceCard
                key={target.characterVersionId}
                resourceKind="character"
                label={target.displayName}
                description={target.versionLabel}
                media={<UserIcon size={18} />}
                selected={active}
                disabled={pending}
                onSelect={() => {
                  if (selectionKind === 'character') {
                    onChange(
                      active
                        ? []
                        : [
                            {
                              characterProjectId: target.characterProjectId,
                              characterVersionId: target.characterVersionId,
                              label: target.displayName,
                            },
                          ],
                    );
                    return;
                  }
                  if (active) {
                    const next = roomParticipants.filter(
                      (item) => item.characterVersionId !== target.characterVersionId,
                    );
                    setRoomParticipants(next);
                    onChange(next.length > 1 ? next : []);
                    return;
                  }
                  const next = [
                    ...roomParticipants,
                    {
                      characterProjectId: target.characterProjectId,
                      characterVersionId: target.characterVersionId,
                      label: target.displayName,
                    },
                  ];
                  setRoomParticipants(next);
                  onChange(next.length > 1 ? next : []);
                }}
              />
            );
          })}
        </div>
      )}

      {selectionKind === 'character' &&
      selected.length === 1 &&
      selectedTarget &&
      selectedTarget.storylines.length > 0 ? (
        <label className="agent-entry-character-storyline">
          <span>{t('chat.entryExperience.characterDialogue.storylineLabel')}</span>
          <select
            value={selected[0]?.characterStorylineVersionId ?? ''}
            disabled={pending}
            onChange={(event) => {
              const storylineVersionId = event.target.value;
              const current = selected[0]!;
              onChange([
                {
                  characterProjectId: current.characterProjectId,
                  characterVersionId: current.characterVersionId,
                  label: current.label,
                  ...(storylineVersionId === ''
                    ? {}
                    : { characterStorylineVersionId: storylineVersionId }),
                },
              ]);
            }}
          >
            <option value="">{t('chat.entryExperience.characterDialogue.storylineNone')}</option>
            {selectedTarget.storylines.map((storyline) => (
              <option key={storyline.storylineVersionId} value={storyline.storylineVersionId}>
                {storyline.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}
