import type { AgentWorldExperienceTargetOption } from '@neko/agent-contracts';
import { PanoramaIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';
import type { SelectedWorldLaunch } from './InputArea/types';
import { EntryResourceCard } from './EntryResourceCard';

export interface WorldExperienceTargetSelectorProps {
  readonly targets: readonly AgentWorldExperienceTargetOption[];
  readonly selected?: SelectedWorldLaunch;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly onChange: (selected: SelectedWorldLaunch | undefined) => void;
}

export function WorldExperienceTargetSelector({
  targets,
  selected,
  loading,
  pending,
  onChange,
}: WorldExperienceTargetSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const groups = groupTargetsByProject(targets);
  return (
    <section
      className="agent-entry-world-selector"
      aria-label={t('chat.entryExperience.worldExperience.selectorLabel')}
      data-world-experience-target-selector="true"
    >
      {loading ? (
        <div className="agent-entry-context-status" role="status">
          {t('chat.entryExperience.worldExperience.loading')}
        </div>
      ) : targets.length === 0 ? (
        <div className="agent-entry-context-status">
          {t('chat.entryExperience.worldExperience.empty')}
        </div>
      ) : (
        <div className="agent-entry-resource-grid agent-entry-world-target-grid" role="group">
          {groups.map(({ globalWorldId, displayName, versions }) => {
            const selectedInProject = selected?.globalWorldId === globalWorldId;
            const exactVersion = selectedInProject
              ? versions.find((target) => target.worldVersionId === selected.worldVersionId)
              : versions.length === 1
                ? versions[0]
                : undefined;
            return (
              <div className="agent-entry-world-card" key={globalWorldId}>
                <EntryResourceCard
                  resourceKind="world"
                  label={displayName}
                  description={
                    exactVersion?.versionLabel ??
                    t('chat.entryExperience.worldExperience.selectExactVersion')
                  }
                  metadata={t('chat.entryExperience.worldExperience.versionCount', {
                    count: versions.length,
                  })}
                  media={<PanoramaIcon size={18} />}
                  selected={selectedInProject}
                  disabled={pending}
                  onSelect={() => {
                    if (selectedInProject) {
                      onChange(undefined);
                    } else if (versions.length === 1 && versions[0]) {
                      onChange(selectionFromTarget(versions[0]));
                    }
                  }}
                />
                {versions.length > 1 ? (
                  <label className="agent-entry-world-version-picker">
                    <span>{t('chat.entryExperience.worldExperience.versionLabel')}</span>
                    <select
                      aria-label={t('chat.entryExperience.worldExperience.versionForWorld', {
                        world: displayName,
                      })}
                      disabled={pending}
                      value={selectedInProject ? selected?.worldVersionId : ''}
                      onChange={(event) => {
                        const target = versions.find(
                          (candidate) => candidate.worldVersionId === event.target.value,
                        );
                        onChange(target ? selectionFromTarget(target) : undefined);
                      }}
                    >
                      <option value="">
                        {t('chat.entryExperience.worldExperience.selectExactVersion')}
                      </option>
                      {versions.map((target) => (
                        <option key={target.worldVersionId} value={target.worldVersionId}>
                          {target.versionLabel}
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

function groupTargetsByProject(targets: readonly AgentWorldExperienceTargetOption[]) {
  const groups = new Map<
    string,
    {
      readonly globalWorldId: string;
      readonly displayName: string;
      readonly versions: AgentWorldExperienceTargetOption[];
    }
  >();
  for (const target of targets) {
    const group = groups.get(target.globalWorldId);
    if (group) {
      if (group.displayName !== target.displayName) {
        throw new Error(`World '${target.globalWorldId}' has inconsistent display names.`);
      }
      group.versions.push(target);
    } else {
      groups.set(target.globalWorldId, {
        globalWorldId: target.globalWorldId,
        displayName: target.displayName,
        versions: [target],
      });
    }
  }
  return [...groups.values()];
}

function selectionFromTarget(target: AgentWorldExperienceTargetOption): SelectedWorldLaunch {
  return {
    globalWorldId: target.globalWorldId,
    worldVersionId: target.worldVersionId,
    label: target.displayName,
    versionLabel: target.versionLabel,
  };
}
