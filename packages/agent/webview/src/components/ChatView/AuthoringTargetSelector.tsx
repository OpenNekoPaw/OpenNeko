import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderIcon, PanoramaIcon, UserIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  AgentComposerAuthoringCatalog,
  AgentComposerAuthoringTargetOption,
  AgentComposerWorkspacePresentation,
  AgentComposerWorkspaceTarget,
} from '../ComposerWorkspaceContext';
import { EntryResourceCard } from './EntryResourceCard';

export interface AuthoringTargetSelectorProps {
  readonly presentation: Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>;
  readonly selected?: AgentComposerWorkspaceTarget;
  readonly pending: boolean;
  readonly onChange: (target: AgentComposerWorkspaceTarget | undefined) => Promise<void>;
}

export function AuthoringTargetSelector({
  presentation,
  selected,
  pending,
  onChange,
}: AuthoringTargetSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<AgentComposerAuthoringCatalog>();
  const [diagnostic, setDiagnostic] = useState<string>();

  useEffect(() => {
    if (!presentation.loadAuthoringCatalog) return;
    let active = true;
    setDiagnostic(undefined);
    void presentation
      .loadAuthoringCatalog()
      .then((next) => {
        if (active) setCatalog(next);
      })
      .catch((error: unknown) => {
        if (active) setDiagnostic(describeError(error));
      });
    return () => {
      active = false;
    };
  }, [presentation]);

  const commitTarget = useCallback(
    async (target: AgentComposerWorkspaceTarget | undefined) => {
      await onChange(target);
    },
    [onChange],
  );

  const selectTarget = useCallback(
    async (option: AgentComposerAuthoringTargetOption) => {
      if (!presentation.onSelectAuthoringTarget) {
        throw new Error('Agent Entry authoring target selector is unavailable.');
      }
      setDiagnostic(undefined);
      try {
        const target = await presentation.onSelectAuthoringTarget(option);
        if (target) await commitTarget(target);
      } catch (error) {
        setDiagnostic(describeError(error));
      }
    },
    [commitTarget, presentation],
  );

  const catalogProjectIds = useMemo(
    () =>
      new Set(
        catalog?.targets.flatMap((option) =>
          option.target.kind === 'content-project' ? [option.target.contentProjectId] : [],
        ) ?? [],
      ),
    [catalog],
  );
  const unprojectedProjects = presentation.projects.filter(
    (project) => !catalogProjectIds.has(project.projectId),
  );

  return (
    <div className="agent-entry-authoring-selector">
      <div
        className="agent-entry-resource-grid agent-entry-authoring-actions"
        aria-label={t('chat.entryAction.label')}
      >
        {catalog?.targets.map((option) => (
          <TargetCard
            key={option.optionId}
            option={option}
            selected={targetsMatch(selected?.target, option.target)}
            pending={pending}
            onSelect={() => void selectTarget(option)}
          />
        ))}
        {unprojectedProjects.map((project) => (
          <EntryResourceCard
            key={project.projectId}
            resourceKind="project"
            label={project.label}
            description={t('chat.entryContext.contentProject')}
            media={<FolderIcon size={18} />}
            selected={
              selected?.target?.kind === 'content-project' &&
              selected.target.contentProjectId === project.projectId
            }
            disabled={project.disabled || pending}
            onSelect={() =>
              void presentation
                .onSelectProject(project.projectId)
                .then(async (target) => {
                  if (target) await commitTarget(target);
                })
                .catch((error: unknown) => setDiagnostic(describeError(error)))
            }
          />
        ))}
      </div>

      {diagnostic ? <p role="alert">{diagnostic}</p> : null}
      {catalog?.diagnostics.map((item) => (
        <p key={item} role="status" className="is-error">
          {item}
        </p>
      ))}
    </div>
  );
}

function TargetCard({
  option,
  selected,
  pending,
  onSelect,
}: {
  readonly option: AgentComposerAuthoringTargetOption;
  readonly selected: boolean;
  readonly pending: boolean;
  readonly onSelect: () => void;
}): JSX.Element {
  const icon =
    option.target.kind === 'content-project' ? (
      <FolderIcon size={18} />
    ) : option.target.kind === 'character-project' ? (
      <UserIcon size={18} />
    ) : (
      <PanoramaIcon size={18} />
    );
  return (
    <EntryResourceCard
      resourceKind={
        option.target.kind === 'content-project'
          ? 'project'
          : option.target.kind === 'character-project'
            ? 'character'
            : 'world'
      }
      label={option.label}
      description={option.workspaceLabel}
      media={icon}
      selected={selected}
      disabled={option.disabled || pending}
      onSelect={onSelect}
    />
  );
}

function targetsMatch(
  selected: AgentComposerWorkspaceTarget['target'] | undefined,
  candidate: AgentComposerAuthoringTargetOption['target'],
): boolean {
  if (!selected || selected.kind !== candidate.kind) return false;
  if (selected.kind === 'content-project' && candidate.kind === 'content-project') {
    return selected.contentProjectId === candidate.contentProjectId;
  }
  if (selected.kind === 'character-project' && candidate.kind === 'character-project') {
    return selected.characterProjectId === candidate.characterProjectId;
  }
  if (selected.kind === 'world-project' && candidate.kind === 'world-project') {
    return selected.worldProjectId === candidate.worldProjectId;
  }
  return false;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
