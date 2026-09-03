import { useCallback, useEffect, useState } from 'react';
import { FolderIcon, PanoramaIcon, UserIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  AgentComposerAuthoringCatalog,
  AgentComposerAuthoringCreationContext,
  AgentComposerAuthoringCreationResult,
  AgentComposerWorkspacePresentation,
  AgentComposerWorkspaceTarget,
} from '../ComposerWorkspaceContext';
import { EntryResourceCard } from './EntryResourceCard';

type EntryWorkspacePresentation = Pick<
  Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>,
  'projects'
> &
  Partial<
    Pick<
      Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>,
      'onSelectProject' | 'loadAuthoringCatalog' | 'onCreateAuthoringTarget'
    >
  >;

export interface AuthoringTargetSelectorProps {
  readonly presentation: EntryWorkspacePresentation;
  readonly selected?: AgentComposerWorkspaceTarget;
  readonly pending: boolean;
  readonly onChange: (target: AgentComposerWorkspaceTarget | undefined) => Promise<void>;
  readonly creationOnlyKind?: AgentComposerAuthoringCreationContext['targetKind'];
  readonly onCancelCreation?: () => void;
}

export function AuthoringTargetSelector({
  presentation,
  selected,
  pending,
  onChange,
  creationOnlyKind,
  onCancelCreation,
}: AuthoringTargetSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<AgentComposerAuthoringCatalog>();
  const [diagnostic, setDiagnostic] = useState<string>();
  const [draftName, setDraftName] = useState('');
  const [creating, setCreating] = useState(false);
  const busy = pending || creating;

  useEffect(() => {
    if (creationOnlyKind === undefined || !presentation.loadAuthoringCatalog) return;
    let active = true;
    setDiagnostic(undefined);
    void presentation.loadAuthoringCatalog().then(
      (next) => {
        if (active) setCatalog(next);
      },
      (error: unknown) => {
        if (active) setDiagnostic(describeError(error));
      },
    );
    return () => {
      active = false;
    };
  }, [creationOnlyKind, presentation]);

  const commitTarget = useCallback(
    async (target: AgentComposerWorkspaceTarget | undefined) => {
      setDiagnostic(undefined);
      await onChange(target);
    },
    [onChange],
  );

  const createTarget = useCallback(
    async (context: AgentComposerAuthoringCreationContext) => {
      const name = draftName.trim();
      if (!name) {
        setDiagnostic(t('chat.entryAuthoring.nameRequired'));
        return;
      }
      if (!presentation.onCreateAuthoringTarget) {
        setDiagnostic(t('chat.entryAuthoring.creationUnavailable'));
        return;
      }
      setDiagnostic(undefined);
      setCreating(true);
      try {
        const result: AgentComposerAuthoringCreationResult | undefined =
          await presentation.onCreateAuthoringTarget(context, name);
        if (result) await commitTarget(result.target);
      } catch (error) {
        setDiagnostic(describeError(error));
      } finally {
        setCreating(false);
      }
    },
    [commitTarget, draftName, presentation, t],
  );

  const selectProject = useCallback(
    async (projectId: string) => {
      if (!presentation.onSelectProject) {
        setDiagnostic(t('chat.entryAuthoring.selectionUnavailable'));
        return;
      }
      setDiagnostic(undefined);
      try {
        const target = await presentation.onSelectProject(projectId);
        if (target) await commitTarget(target);
      } catch (error) {
        setDiagnostic(describeError(error));
      }
    },
    [commitTarget, presentation, t],
  );

  if (creationOnlyKind !== undefined) {
    const creationContexts =
      catalog?.creationContexts.filter((context) => context.targetKind === creationOnlyKind) ?? [];
    return (
      <div className="agent-entry-authoring-selector agent-entry-authoring-creation">
        <div className="agent-entry-authoring-creation-header">
          <label htmlFor="agent-entry-authoring-name">{t('chat.entryAuthoring.nameLabel')}</label>
          <div className="agent-entry-authoring-name-row">
            <input
              id="agent-entry-authoring-name"
              value={draftName}
              disabled={busy}
              placeholder={t('chat.entryAuthoring.namePlaceholder')}
              onChange={(event) => {
                setDraftName(event.target.value);
                setDiagnostic(undefined);
              }}
            />
            {onCancelCreation ? (
              <button type="button" disabled={busy} onClick={onCancelCreation}>
                {t('chat.entryAuthoring.cancel')}
              </button>
            ) : null}
          </div>
        </div>
        <div
          className="agent-entry-resource-grid agent-entry-authoring-actions"
          aria-label={t('chat.entryAuthoring.destinationLabel')}
        >
          {creationContexts.map((context) => (
            <EntryResourceCard
              key={context.creationId}
              resourceKind={creationResourceKind(context.targetKind)}
              label={context.label}
              description={t('chat.entryAuthoring.createDescription')}
              media={creationIcon(context.targetKind)}
              disabled={busy || draftName.trim().length === 0}
              onSelect={() => void createTarget(context)}
            />
          ))}
        </div>
        {catalog && creationContexts.length === 0 ? (
          <p role="status">{t('chat.entryAuthoring.noDestination')}</p>
        ) : null}
        {diagnostic ? <p role="alert">{diagnostic}</p> : null}
        {catalog?.diagnostics.map((item) => (
          <p key={item} role="status" className="is-error">
            {item}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="agent-entry-authoring-selector">
      <div
        className="agent-entry-resource-grid agent-entry-authoring-actions"
        aria-label={t('chat.entryAction.label')}
      >
        {presentation.projects.map((project) => (
          <EntryResourceCard
            key={project.projectId}
            resourceKind="project"
            label={project.label}
            description={t('chat.entryAction.chooseProjectDescription')}
            media={<FolderIcon size={18} />}
            selected={selected?.authority?.projectId === project.projectId}
            disabled={project.disabled || busy}
            onSelect={() => {
              if (selected?.authority?.projectId === project.projectId) {
                void commitTarget(undefined);
                return;
              }
              void selectProject(project.projectId);
            }}
          />
        ))}
      </div>
      {diagnostic ? <p role="alert">{diagnostic}</p> : null}
    </div>
  );
}

function creationResourceKind(
  kind: AgentComposerAuthoringCreationContext['targetKind'],
): 'character' | 'world' {
  return kind === 'character-project' ? 'character' : 'world';
}

function creationIcon(kind: AgentComposerAuthoringCreationContext['targetKind']): JSX.Element {
  return kind === 'character-project' ? <UserIcon size={18} /> : <PanoramaIcon size={18} />;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
