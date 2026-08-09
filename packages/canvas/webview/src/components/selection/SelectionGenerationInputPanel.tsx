import {
  purposeForCanvasGenerationKind,
  selectedCanvasGenerationOutput,
  type CanvasConnection,
  type CanvasGenerationRecipe,
  type CanvasNode,
  type CanvasViewport,
  type GenerationCanvasNode,
} from '@neko/canvas-domain';
import { PlayIcon, PlusIcon, StopIcon } from '@neko/ui/icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOptionalCanvasHost } from '../../host-runtime';
import { t } from '../../i18n';

interface SelectionGenerationInputPanelProps {
  readonly nodes: readonly CanvasNode[];
  readonly connections: readonly CanvasConnection[];
  readonly selectedNodeIds: readonly string[];
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly hidden?: boolean;
}

export function SelectionGenerationInputPanel({
  nodes,
  connections,
  selectedNodeIds,
  viewportSize,
  hidden = false,
}: SelectionGenerationInputPanelProps): ReactNode {
  const selectedNode =
    selectedNodeIds.length === 1
      ? nodes.find(
          (candidate): candidate is GenerationCanvasNode =>
            candidate.id === selectedNodeIds[0] && candidate.type === 'generation',
        )
      : undefined;
  if (hidden || !selectedNode) return null;

  return (
    <GenerationInputPanel
      key={selectedNode.id}
      node={selectedNode}
      nodes={nodes}
      connections={connections}
      viewportSize={viewportSize}
    />
  );
}

function GenerationInputPanel({
  node,
  nodes,
  connections,
  viewportSize,
}: {
  readonly node: GenerationCanvasNode;
  readonly nodes: readonly CanvasNode[];
  readonly connections: readonly CanvasConnection[];
  readonly viewportSize: { readonly width: number; readonly height: number };
}) {
  const host = useOptionalCanvasHost();
  const [recipe, setRecipe] = useState<CanvasGenerationRecipe>(node.data.recipe);
  const [localDiagnostic, setLocalDiagnostic] = useState<string>();
  const authoritativeRecipeRef = useRef(node.data.recipe);
  const pendingCommitRef = useRef<{
    readonly fingerprint: string;
    readonly promise: Promise<void>;
  }>();
  useEffect(() => {
    const previousAuthoritative = authoritativeRecipeRef.current;
    authoritativeRecipeRef.current = node.data.recipe;
    setRecipe((current) =>
      recipesEqual(current, previousAuthoritative) ? node.data.recipe : current,
    );
  }, [node.data.recipe]);
  const projection = host?.getGenerationProjection(node.id);
  const selectedOutput = selectedCanvasGenerationOutput(node.data);
  const active =
    projection?.phase === 'binding' ||
    projection?.phase === 'pending' ||
    projection?.phase === 'running';
  const position = resolveGenerationInputPanelPosition(viewportSize);
  const references = useMemo(
    () =>
      connections
        .filter((connection) => connection.targetId === node.id)
        .map((connection) => ({
          connection,
          source: nodes.find((candidate) => candidate.id === connection.sourceId),
        })),
    [connections, node.id, nodes],
  );

  const reportFailure = (error: unknown): void => {
    setLocalDiagnostic(error instanceof Error ? error.message : String(error));
  };

  const commitRecipe = async (next = recipe): Promise<void> => {
    if (!host) throw new Error('Canvas Generation Host is unavailable.');
    const fingerprint = JSON.stringify(next);
    if (pendingCommitRef.current?.fingerprint === fingerprint) {
      return pendingCommitRef.current.promise;
    }
    const previousCommit = pendingCommitRef.current?.promise;
    const promise = (async () => {
      await previousCommit?.catch(() => undefined);
      if (recipesEqual(next, authoritativeRecipeRef.current)) return;
      await host.updateGenerationRecipe(node.id, next);
      authoritativeRecipeRef.current = next;
      setLocalDiagnostic(undefined);
    })();
    pendingCommitRef.current = { fingerprint, promise };
    try {
      await promise;
    } finally {
      if (pendingCommitRef.current?.promise === promise) {
        pendingCommitRef.current = undefined;
      }
    }
  };

  const commitOnBlur = (): void => {
    void commitRecipe().catch(reportFailure);
  };

  const setModelField = (field: 'providerId' | 'modelId', value: string): void => {
    setRecipe((currentRecipe) => ({
      ...currentRecipe,
      model: {
        ...(currentRecipe.model ?? {
          purpose: purposeForCanvasGenerationKind(currentRecipe.kind),
          providerId: '',
          modelId: '',
        }),
        [field]: value,
      },
    }));
  };

  const runOrCancel = async (): Promise<void> => {
    if (!host) throw new Error('Canvas Generation Host is unavailable.');
    if (active) {
      await host.cancelGenerationNode(node.id);
    } else {
      await commitRecipe();
      await host.runGenerationNode(node.id);
    }
    setLocalDiagnostic(undefined);
  };

  return (
    <section
      className="selection-generation-input-panel"
      data-canvas-generation-input="true"
      data-canvas-generation-input-kind={recipe.kind}
      data-placement="viewport-bottom"
      aria-label={t('generation.inputPanel')}
      style={{
        left: position.x,
        bottom: position.bottom,
        width: position.width,
        minHeight: position.minHeight,
        maxHeight: position.maxHeight,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="selection-generation-input-panel__references">
        <span className="selection-generation-input-panel__reference-slot" aria-hidden="true">
          <PlusIcon size={16} />
        </span>
        <div className="selection-generation-input-panel__reference-list">
          {references.length > 0 ? (
            references.map(({ connection, source }, index) => (
              <span key={connection.id} className="selection-generation-input-panel__reference">
                {source ? referenceLabel(source) : t('generation.referenceMissing')}
                <small>
                  {connection.targetEndpoint?.portId ??
                    t('generation.reference', { number: index + 1 })}
                </small>
              </span>
            ))
          ) : (
            <span className="selection-generation-input-panel__empty-reference">
              {t('generation.references')}
            </span>
          )}
        </div>
      </div>

      <textarea
        aria-label={t('generation.prompt')}
        className="selection-generation-input-panel__prompt"
        placeholder={t('generation.promptPlaceholder')}
        value={recipe.prompt}
        onChange={(event) => {
          const prompt = event.currentTarget.value;
          setRecipe((currentRecipe) => ({ ...currentRecipe, prompt }));
        }}
        onBlur={commitOnBlur}
      />

      <div className="selection-generation-input-panel__footer">
        <div className="selection-generation-input-panel__controls">
          <input
            aria-label={t('generation.provider')}
            placeholder={t('generation.provider')}
            value={recipe.model?.providerId ?? ''}
            onChange={(event) => setModelField('providerId', event.currentTarget.value)}
            onBlur={commitOnBlur}
          />
          <input
            aria-label={t('generation.model')}
            placeholder={t('generation.model')}
            value={recipe.model?.modelId ?? ''}
            onChange={(event) => setModelField('modelId', event.currentTarget.value)}
            onBlur={commitOnBlur}
          />
          <KindParameters
            recipe={recipe}
            onChange={setRecipe}
            onCommit={commitRecipe}
            onFailure={reportFailure}
          />
          {node.data.outputs.length > 0 ? (
            <select
              aria-label={t('generation.outputHistory')}
              value={selectedOutput?.outputId ?? ''}
              onChange={(event) => {
                void host
                  ?.selectGenerationOutput(node.id, event.currentTarget.value)
                  .catch(reportFailure);
              }}
            >
              {node.data.outputs.map((output, index) => (
                <option key={output.outputId} value={output.outputId}>
                  {t('generation.output', { number: index + 1 })}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <button
          className="selection-generation-input-panel__run"
          type="button"
          aria-label={active ? t('generation.cancel') : t('generation.run')}
          title={active ? t('generation.cancel') : t('generation.run')}
          onClick={() => void runOrCancel().catch(reportFailure)}
        >
          {active ? <StopIcon size={15} /> : <PlayIcon size={15} />}
        </button>
      </div>

      {projection?.recipeStale ? (
        <div
          className="selection-generation-input-panel__warning"
          data-canvas-generation-recipe-stale="true"
        >
          {t('generation.recipeStale')}
        </div>
      ) : null}
      {(localDiagnostic ?? projection?.diagnostic?.message) ? (
        <div className="selection-generation-input-panel__diagnostic" role="alert">
          {localDiagnostic ?? projection?.diagnostic?.message}
        </div>
      ) : null}
    </section>
  );
}

function KindParameters({
  recipe,
  onChange,
  onCommit,
  onFailure,
}: {
  readonly recipe: CanvasGenerationRecipe;
  readonly onChange: (recipe: CanvasGenerationRecipe) => void;
  readonly onCommit: (recipe?: CanvasGenerationRecipe) => Promise<void>;
  readonly onFailure: (error: unknown) => void;
}) {
  const numeric = (
    label: string,
    value: number | undefined,
    update: (value: number | undefined) => CanvasGenerationRecipe,
  ) => (
    <input
      aria-label={label}
      type="number"
      placeholder={label}
      value={value ?? ''}
      onChange={(event) =>
        onChange(update(event.currentTarget.value ? Number(event.currentTarget.value) : undefined))
      }
      onBlur={() => void onCommit().catch(onFailure)}
    />
  );
  switch (recipe.kind) {
    case 'prompt':
      return (
        <>
          {numeric(t('generation.temperature'), recipe.temperature, (temperature) => ({
            ...recipe,
            temperature,
          }))}
          {numeric(t('generation.maxTokens'), recipe.maxOutputTokens, (maxOutputTokens) => ({
            ...recipe,
            maxOutputTokens,
          }))}
        </>
      );
    case 'image':
      return (
        <>
          <input
            aria-label={t('generation.aspectRatio')}
            placeholder={t('generation.aspectRatio')}
            value={recipe.aspectRatio ?? ''}
            onChange={(event) =>
              onChange({ ...recipe, aspectRatio: event.currentTarget.value || undefined })
            }
            onBlur={() => void onCommit().catch(onFailure)}
          />
          {numeric(t('generation.count'), recipe.count, (count) => ({ ...recipe, count }))}
        </>
      );
    case 'video':
      return (
        <>
          {numeric(t('generation.duration'), recipe.duration, (duration) => ({
            ...recipe,
            duration,
          }))}
          <input
            aria-label={t('generation.resolution')}
            placeholder={t('generation.resolution')}
            value={recipe.resolution ?? ''}
            onChange={(event) =>
              onChange({ ...recipe, resolution: event.currentTarget.value || undefined })
            }
            onBlur={() => void onCommit().catch(onFailure)}
          />
        </>
      );
    case 'audio':
      return (
        <>
          {numeric(t('generation.duration'), recipe.duration, (duration) => ({
            ...recipe,
            duration,
          }))}
          <label className="selection-generation-input-panel__toggle">
            <input
              type="checkbox"
              checked={recipe.isMusic ?? false}
              onChange={(event) => {
                const next = { ...recipe, isMusic: event.currentTarget.checked };
                onChange(next);
                void onCommit(next).catch(onFailure);
              }}
            />
            {t('generation.music')}
          </label>
        </>
      );
  }
}

function referenceLabel(node: CanvasNode): string {
  switch (node.type) {
    case 'markdown':
      return (
        node.data.content
          .split('\n')
          .find((line) => line.trim())
          ?.replace(/^#+\s*/, '') ?? node.id
      );
    case 'media':
      return node.data.title || basename(node.data.assetPath) || node.id;
    case 'file':
      return node.data.title || basename(node.data.path) || node.id;
    case 'canvas-embed':
      return node.data.canvasTitle || basename(node.data.canvasPath) || node.id;
    case 'generation':
      return t(`generation.kind.${node.data.recipe.kind}`);
    case 'group':
    case 'job':
      return node.id;
  }
}

function basename(value: string): string {
  return value.split('/').filter(Boolean).at(-1) ?? '';
}

function recipesEqual(left: CanvasGenerationRecipe, right: CanvasGenerationRecipe): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resolveGenerationInputPanelPosition(viewportSize: {
  readonly width: number;
  readonly height: number;
}): {
  readonly x: number;
  readonly bottom: number;
  readonly width: number;
  readonly minHeight: number;
  readonly maxHeight: number;
} {
  const viewportWidth = Math.max(0, viewportSize.width);
  const viewportHeight = Math.max(0, viewportSize.height);
  const width = Math.min(760, Math.max(280, viewportWidth - 24));
  return {
    x: viewportWidth / 2,
    bottom: 16,
    width,
    minHeight: viewportWidth <= 520 ? 246 : 214,
    maxHeight: Math.max(180, viewportHeight - 32),
  };
}

export function resolveGenerationSelectionSafePan(
  node: GenerationCanvasNode,
  viewport: CanvasViewport,
  viewportSize: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } | undefined {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) return undefined;

  const panel = resolveGenerationInputPanelPosition(viewportSize);
  const nodeTop = viewport.pan.y + node.position.y * viewport.zoom;
  const nodeBottom = nodeTop + node.size.height * viewport.zoom;
  const safeTop = 54;
  const safeBottom = viewportSize.height - panel.bottom - panel.minHeight - 16;
  if (nodeBottom <= safeBottom) return undefined;

  const shiftY = Math.max(safeTop - nodeTop, safeBottom - nodeBottom);
  if (shiftY >= 0) return undefined;
  return { x: viewport.pan.x, y: viewport.pan.y + shiftY };
}
