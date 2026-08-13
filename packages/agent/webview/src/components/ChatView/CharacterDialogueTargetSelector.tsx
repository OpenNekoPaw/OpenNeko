import type { AgentCharacterDialogueTargetOption } from '@neko/agent-contracts';
import { UserIcon } from '@neko/ui/icons';
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
  const targetsByProject = groupTargetsByProject(targets);

  return (
    <section
      className="agent-entry-character-selector"
      aria-label={t('chat.entryExperience.characterDialogue.selectorLabel')}
      data-character-dialogue-target-selector="true"
    >
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
          {targetsByProject.map(({ characterProjectId, displayName, versions }) => {
            const selectedTarget = selected.find(
              (item) => item.characterProjectId === characterProjectId,
            );
            const active = selectedTarget !== undefined;
            const exactVersion = selectedTarget
              ? versions.find(
                  (target) => target.characterVersionId === selectedTarget.characterVersionId,
                )
              : versions.length === 1
                ? versions[0]
                : undefined;
            return (
              <div className="agent-entry-character-card" key={characterProjectId}>
                <EntryResourceCard
                  resourceKind="character"
                  label={displayName}
                  description={
                    exactVersion?.versionLabel ??
                    t('chat.entryExperience.characterDialogue.selectExactVersion')
                  }
                  metadata={
                    exactVersion
                      ? presentLineage(exactVersion, t)
                      : t('chat.entryExperience.characterDialogue.versionCount', {
                          count: versions.length,
                        })
                  }
                  media={<UserIcon size={18} />}
                  selected={active}
                  disabled={pending}
                  onSelect={() => {
                    if (active) {
                      onChange(
                        selected.filter((item) => item.characterProjectId !== characterProjectId),
                      );
                      return;
                    }
                    if (versions.length !== 1 || !versions[0]) return;
                    onChange([...selected, selectionFromTarget(versions[0])]);
                  }}
                />
                {versions.length > 1 ? (
                  <label className="agent-entry-character-version-picker">
                    <span>{t('chat.entryExperience.characterDialogue.versionLabel')}</span>
                    <select
                      aria-label={t('chat.entryExperience.characterDialogue.versionForCharacter', {
                        character: displayName,
                      })}
                      disabled={pending}
                      value={selectedTarget?.characterVersionId ?? ''}
                      onChange={(event) => {
                        const remaining = selected.filter(
                          (item) => item.characterProjectId !== characterProjectId,
                        );
                        if (!event.target.value) {
                          onChange(remaining);
                          return;
                        }
                        const target = versions.find(
                          (candidate) => candidate.characterVersionId === event.target.value,
                        );
                        if (!target) {
                          throw new Error(
                            `CharacterVersion '${event.target.value}' is unavailable for exact Character '${characterProjectId}'.`,
                          );
                        }
                        onChange([...remaining, selectionFromTarget(target)]);
                      }}
                    >
                      <option value="">
                        {t('chat.entryExperience.characterDialogue.selectExactVersion')}
                      </option>
                      {versions.map((target) => (
                        <option key={target.characterVersionId} value={target.characterVersionId}>
                          {`${target.versionLabel} — ${presentLineage(target, t)}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type Translation = (key: string, params?: Record<string, string | number>) => string;

function groupTargetsByProject(targets: readonly AgentCharacterDialogueTargetOption[]) {
  const groups = new Map<
    string,
    {
      readonly characterProjectId: string;
      readonly displayName: string;
      readonly versions: AgentCharacterDialogueTargetOption[];
    }
  >();
  for (const target of targets) {
    const current = groups.get(target.characterProjectId);
    if (current) {
      if (current.displayName !== target.displayName) {
        throw new Error(
          `Character '${target.characterProjectId}' has inconsistent launch display names.`,
        );
      }
      current.versions.push(target);
      continue;
    }
    groups.set(target.characterProjectId, {
      characterProjectId: target.characterProjectId,
      displayName: target.displayName,
      versions: [target],
    });
  }
  return [...groups.values()];
}

function selectionFromTarget(target: AgentCharacterDialogueTargetOption): SelectedCharacterLaunch {
  return {
    characterProjectId: target.characterProjectId,
    characterVersionId: target.characterVersionId,
    label: target.displayName,
  };
}

function presentLineage(target: AgentCharacterDialogueTargetOption, t: Translation): string {
  if (target.lineage.coverage === 'unavailable') {
    return t('chat.entryExperience.characterDialogue.lineageUnavailable');
  }
  const path = target.lineage.path.map((segment) => segment.label).join(' / ');
  const states = [
    target.lineage.state === 'unlinked'
      ? t('chat.entryExperience.characterDialogue.unlinked')
      : undefined,
    target.lineage.isHead ? t('chat.entryExperience.characterDialogue.head') : undefined,
  ].filter((value): value is string => value !== undefined);
  return states.length > 0 ? `${states.join(' · ')} · ${path}` : path;
}
