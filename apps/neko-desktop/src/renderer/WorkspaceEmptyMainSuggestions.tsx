import {
  CANVAS_DEFAULT_DOCUMENT_PATH,
  type CanvasWorkspaceContextCatalog,
} from '@neko/canvas-domain';
import { GridIcon, OpenIcon, WarningIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useEffect, useState, type ReactNode } from 'react';

export type WorkspaceMainSuggestion =
  | {
      readonly kind: 'default-canvas';
      readonly canvasId: typeof CANVAS_DEFAULT_DOCUMENT_PATH;
      readonly label: 'workspace.nkc';
    }
  | {
      readonly kind: 'canvas-document';
      readonly canvasId: string;
      readonly label: string;
      readonly disabled?: boolean;
      readonly diagnostic?: string;
    };

export function WorkspaceEmptyMainSuggestions({
  createControl,
  loadWorkspaceCanvases,
  onOpen,
  workspaceId,
}: {
  readonly createControl: ReactNode;
  readonly loadWorkspaceCanvases: () => Promise<CanvasWorkspaceContextCatalog>;
  readonly onOpen: (suggestion: WorkspaceMainSuggestion) => Promise<void>;
  readonly workspaceId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<readonly WorkspaceMainSuggestion[]>([
    defaultCanvasSuggestion(),
  ]);
  const [loading, setLoading] = useState(true);
  const [loadDiagnostic, setLoadDiagnostic] = useState<string>();
  const [openDiagnostic, setOpenDiagnostic] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();

  useEffect(() => {
    let active = true;
    setSuggestions([defaultCanvasSuggestion()]);
    setLoading(true);
    setLoadDiagnostic(undefined);
    setOpenDiagnostic(undefined);
    void loadWorkspaceCanvases()
      .then((catalog) => {
        if (!active) return;
        setSuggestions(projectWorkspaceMainSuggestions(catalog));
        setLoadDiagnostic(catalog.diagnostics.at(-1));
      })
      .catch((error: unknown) => {
        if (active) setLoadDiagnostic(describeError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadWorkspaceCanvases, workspaceId]);

  const openSuggestion = async (suggestion: WorkspaceMainSuggestion): Promise<void> => {
    setPendingId(suggestion.canvasId);
    setOpenDiagnostic(undefined);
    try {
      await onOpen(suggestion);
    } catch (error: unknown) {
      setOpenDiagnostic(describeError(error));
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <div className="workspace-empty-main-suggestions" data-workspace-suggestions={workspaceId}>
      <div className="workspace-empty-main-suggestions__heading">
        {t('workspace.emptySuggestions.title')}
      </div>
      <div
        aria-label={t('workspace.emptySuggestions.title')}
        className="workspace-empty-main-suggestions__list"
        role="group"
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.canvasId}
            aria-label={t('workspace.emptySuggestions.open', { name: suggestion.label })}
            className="workspace-empty-main-suggestions__item"
            data-workspace-suggestion={suggestion.kind}
            disabled={
              pendingId !== undefined ||
              (suggestion.kind === 'canvas-document' && suggestion.disabled === true)
            }
            onClick={() => void openSuggestion(suggestion)}
            type="button"
          >
            <span className="workspace-empty-main-suggestions__icon" aria-hidden="true">
              <GridIcon size={16} />
            </span>
            <span className="workspace-empty-main-suggestions__copy">
              <strong>{suggestion.label}</strong>
              <span>
                {suggestion.kind === 'default-canvas'
                  ? t('workspace.emptySuggestions.defaultCanvas')
                  : (suggestion.diagnostic ?? t('workspace.emptySuggestions.canvas'))}
              </span>
            </span>
            {suggestion.kind === 'canvas-document' && suggestion.disabled ? (
              <WarningIcon size={15} aria-hidden="true" />
            ) : (
              <OpenIcon size={15} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {loading ? (
        <span className="workspace-empty-main-suggestions__status" role="status">
          {t('workspace.emptySuggestions.loading')}
        </span>
      ) : null}
      {openDiagnostic || loadDiagnostic ? (
        <span className="workspace-empty-main-suggestions__diagnostic" role="alert">
          <WarningIcon size={14} aria-hidden="true" />
          {openDiagnostic ?? loadDiagnostic}
        </span>
      ) : null}
      <div className="workspace-empty-main-suggestions__actions">{createControl}</div>
    </div>
  );
}

export function projectWorkspaceMainSuggestions(
  catalog: CanvasWorkspaceContextCatalog,
): readonly WorkspaceMainSuggestion[] {
  if (catalog.defaultTarget.workspaceId !== catalog.workspaceId) {
    throw new Error('Workspace Main Canvas catalog has a mismatched default target.');
  }
  const suggestions: WorkspaceMainSuggestion[] = [defaultCanvasSuggestion()];
  for (const option of catalog.options) {
    if (option.target.workspaceId !== catalog.workspaceId) {
      throw new Error('Workspace Main Canvas suggestion belongs to another Workspace.');
    }
    if (option.target.canvasId === CANVAS_DEFAULT_DOCUMENT_PATH) continue;
    suggestions.push({
      kind: 'canvas-document',
      canvasId: option.target.canvasId,
      label: option.label,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
      ...(option.diagnostic === undefined ? {} : { diagnostic: option.diagnostic }),
    });
    if (suggestions.length === 5) break;
  }
  return suggestions;
}

function defaultCanvasSuggestion(): WorkspaceMainSuggestion {
  return {
    kind: 'default-canvas',
    canvasId: CANVAS_DEFAULT_DOCUMENT_PATH,
    label: 'workspace.nkc',
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
