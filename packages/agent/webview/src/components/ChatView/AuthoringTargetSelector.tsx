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

export interface AuthoringTargetSelectorProps {
  readonly presentation: Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>;
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

  useEffect(() => {
    if (creationOnlyKind === undefined || !presentation.loadAuthoringCatalog) return;
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
  }, [creationOnlyKind, presentation]);

  const commitTarget = useCallback(
    async (target: AgentComposerWorkspaceTarget | undefined) => {
      await onChange(target);
    },
    [onChange],
  );

  const acceptCreationResult = useCallback(
    async (result: AgentComposerAuthoringCreationResult) => {
      setDiagnostic(undefined);
      await commitTarget(result.target);
    },
    [commitTarget],
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
      try {
        const target = await presentation.onCreateAuthoringTarget(context, name);
        if (target) await acceptCreationResult(target);
      } catch (error) {
        setDiagnostic(describeError(error));
      }
    },
    [acceptCreationResult, draftName, presentation, t],
  );

  const creationContexts =
    creationOnlyKind === undefined
      ? []
      : (catalog?.creationContexts.filter((context) => context.targetKind === creationOnlyKind) ??
        []);

  if (creationOnlyKind !== undefined) {
    return (
      <div className="agent-entry-authoring-selector agent-entry-authoring-creation">
        <div className="agent-entry-authoring-creation-header">
          <label htmlFor="agent-entry-authoring-name">{t('chat.entryAuthoring.nameLabel')}</label>
          <div className="agent-entry-authoring-name-row">
            <input
              id="agent-entry-authoring-name"
              value={draftName}
              disabled={pending}
              placeholder={t('chat.entryAuthoring.namePlaceholder')}
              onChange={(event) => {
                setDraftName(event.target.value);
                setDiagnostic(undefined);
              }}
            />
            {onCancelCreation ? (
              <button type="button" disabled={pending} onClick={onCancelCreation}>
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
              disabled={pending || draftName.trim().length === 0}
              onSelect={() => void createTarget(context)}
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
