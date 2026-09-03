import {
  conformCanvasVideoGenerationRecipeToProfile,
  createCanvasGenerationNodeData,
  purposeForCanvasGenerationRecipe,
  inferCanvasMediaType,
  selectedCanvasGenerationOutput,
  type CanvasConnection,
  type CanvasGenerationModelBinding,
  type CanvasGenerationModelOption,
  type CanvasGenerationRecipe,
  type CanvasMaterialMediaKind,
  type CanvasNode,
  type CanvasViewport,
  type GenerationCanvasNode,
} from '@neko/canvas-domain';
import { CONTENT_LOCATOR_DRAG_MIME, parseContentLocatorDragData } from '@neko/content-domain';
import {
  CheckIcon,
  ChevronDownIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  StopIcon,
} from '@neko/ui/icons';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useOptionalCanvasHost } from '../../host-runtime';
import { t } from '../../i18n';
import { resolveSelectionToolbarTop } from './selectionAttachmentGeometry';

interface SelectionGenerationInputPanelProps {
  readonly nodes: readonly CanvasNode[];
  readonly connections: readonly CanvasConnection[];
  readonly selectedNodeIds: readonly string[];
  readonly viewport: CanvasViewport;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly hidden?: boolean;
  readonly onLayoutMeasure?: (measurement: {
    readonly nodeId: string;
    readonly height: number;
  }) => void;
}

export function SelectionGenerationInputPanel({
  nodes,
  connections,
  selectedNodeIds,
  viewport,
  viewportSize,
  hidden = false,
  onLayoutMeasure,
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
      viewport={viewport}
      viewportSize={viewportSize}
      onLayoutMeasure={onLayoutMeasure}
    />
  );
}

function GenerationInputPanel({
  node,
  nodes,
  connections,
  viewport,
  viewportSize,
  onLayoutMeasure,
}: {
  readonly node: GenerationCanvasNode;
  readonly nodes: readonly CanvasNode[];
  readonly connections: readonly CanvasConnection[];
  readonly viewport: CanvasViewport;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly onLayoutMeasure?: (measurement: {
    readonly nodeId: string;
    readonly height: number;
  }) => void;
}) {
  const host = useOptionalCanvasHost();
  const panelRef = useRef<HTMLElement>(null);
  const generationModels = host?.getAuthoringCapabilities().generationModels ?? [];
  const [recipe, setRecipe] = useState<CanvasGenerationRecipe>(node.data.recipe);
  const [measuredHeight, setMeasuredHeight] = useState<number>();
  const [localDiagnostic, setLocalDiagnostic] = useState<string>();
  const [addingReference, setAddingReference] = useState(false);
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [referenceDragActive, setReferenceDragActive] = useState(false);
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
  const requiredPurpose = purposeForCanvasGenerationRecipe(recipe);
  const availableModels = generationModels.filter(
    (option) => option.binding.purpose === requiredPurpose,
  );
  const selectedModel = generationModels.find((option) =>
    modelBindingsEqual(option.binding, recipe.model),
  );
  const modelBindingUnavailable = recipe.model !== undefined && selectedModel === undefined;
  const modelParameterProfileUnavailable =
    (recipe.kind === 'image' || recipe.kind === 'video') &&
    selectedModel !== undefined &&
    selectedModel.parameterProfile?.kind !== recipe.kind;
  const selectedOutput = selectedCanvasGenerationOutput(node.data);
  const active =
    projection?.phase === 'binding' ||
    projection?.phase === 'pending' ||
    projection?.phase === 'running';
  const position = resolveGenerationInputPanelPosition(
    node,
    viewport,
    viewportSize,
    recipe.kind,
    measuredHeight,
  );
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
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const publishHeight = (): void => {
      const height = panel.getBoundingClientRect().height;
      setMeasuredHeight(height);
      onLayoutMeasure?.({ nodeId: node.id, height });
    };
    publishHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publishHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [node.id, onLayoutMeasure]);

  const reportFailure = (error: unknown): void => {
    setLocalDiagnostic(error instanceof Error ? error.message : String(error));
  };

  const commitRecipe = useCallback(
    async (next: CanvasGenerationRecipe): Promise<void> => {
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
    },
    [host, node.id],
  );

  const configuredDefaultRecipe = resolveUntouchedRecipeConfiguredDefault(
    { ...node, data: { ...node.data, recipe } },
    connections,
    generationModels,
  );
  useEffect(() => {
    if (!configuredDefaultRecipe) return;
    setRecipe(configuredDefaultRecipe);
    void commitRecipe(configuredDefaultRecipe).catch(reportFailure);
  }, [commitRecipe, configuredDefaultRecipe]);
  useEffect(() => {
    if (recipe.kind !== 'video' || !selectedModel) return;
    const next =
      selectedModel.parameterProfile?.kind === 'video'
        ? conformCanvasVideoGenerationRecipeToProfile(recipe, selectedModel.parameterProfile).recipe
        : {
            ...createCanvasGenerationNodeData('video', selectedModel.binding).recipe,
            prompt: recipe.prompt,
          };
    if (recipesEqual(recipe, next)) return;
    setRecipe(next);
    void commitRecipe(next)
      .then(() => {
        if (selectedModel.parameterProfile?.kind === 'video') {
          setLocalDiagnostic(t('generation.parametersAdjusted', { model: selectedModel.label }));
        }
      })
      .catch(reportFailure);
  }, [commitRecipe, recipe, selectedModel]);

  const commitOnBlur = (): void => {
    void commitRecipe(recipe).catch(reportFailure);
  };

  const selectModel = (option: CanvasGenerationModelOption): void => {
    const candidate: CanvasGenerationRecipe = { ...recipe, model: option.binding };
    const result =
      candidate.kind === 'video'
        ? option.parameterProfile?.kind === 'video'
          ? conformCanvasVideoGenerationRecipeToProfile(candidate, option.parameterProfile)
          : {
              recipe: {
                ...createCanvasGenerationNodeData('video', option.binding).recipe,
                prompt: candidate.prompt,
              },
              adjustments: [],
            }
        : { recipe: candidate, adjustments: [] };
    const next = result.recipe;
    setRecipe(next);
    void commitRecipe(next)
      .then(() => {
        if (result.adjustments.length > 0) {
          setLocalDiagnostic(t('generation.parametersAdjusted', { model: option.label }));
        }
      })
      .catch(reportFailure);
  };

  const runOrCancel = async (): Promise<void> => {
    if (!host) throw new Error('Canvas Generation Host is unavailable.');
    if (active) {
      await host.cancelGenerationNode(node.id);
    } else {
      await commitRecipe(recipe);
      await host.runGenerationNode(node.id);
    }
    setLocalDiagnostic(undefined);
  };

  const addReference = async (sourceMode: 'import' | 'reference'): Promise<void> => {
    if (!host) throw new Error('Canvas Generation Host is unavailable.');
    setAddingReference(true);
    try {
      await host.attachGenerationReference(node.id, referenceSourceKind(recipe.kind), sourceMode);
      setLocalDiagnostic(undefined);
      setReferenceMenuOpen(false);
    } finally {
      setAddingReference(false);
    }
  };

  const dropWorkspaceReference = async (dataTransfer: DataTransfer): Promise<void> => {
    if (!host) throw new Error('Canvas Generation Host is unavailable.');
    const payload = readGenerationReferenceDragPayload(dataTransfer, recipe.kind);
    await host.attachGenerationReferenceMaterial(node.id, payload);
    setLocalDiagnostic(undefined);
  };

  return (
    <section
      ref={panelRef}
      className="selection-generation-input-panel"
      data-canvas-generation-input="true"
      data-canvas-generation-input-kind={recipe.kind}
      data-placement={position.placement}
      data-surface="editor"
      aria-label={t('generation.inputPanel')}
      style={
        {
          left: position.x,
          top: position.top,
          width: position.width,
          minHeight: position.minHeight,
          maxHeight: position.maxHeight,
          '--generation-input-panel-width': `${position.width}px`,
        } as CSSProperties
      }
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="selection-generation-input-panel__references"
        data-canvas-generation-reference-zone="true"
        data-drag-active={referenceDragActive ? 'true' : undefined}
        onDragEnter={(event) => {
          if (!hasGenerationReferenceDragPayload(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          setReferenceDragActive(true);
        }}
        onDragOver={(event) => {
          if (!hasGenerationReferenceDragPayload(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setReferenceDragActive(false);
        }}
        onDrop={(event) => {
          if (!hasGenerationReferenceDragPayload(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          setReferenceDragActive(false);
          void dropWorkspaceReference(event.dataTransfer).catch(reportFailure);
        }}
      >
        <ComposerPopover
          open={referenceMenuOpen}
          onOpenChange={setReferenceMenuOpen}
          contentClassName="selection-generation-input-panel__popover selection-generation-input-panel__reference-menu"
          trigger={(toggle) => (
            <button
              type="button"
              className="selection-generation-input-panel__reference-slot"
              data-canvas-generation-reference-add="true"
              aria-label={t('generation.addReference')}
              aria-expanded={referenceMenuOpen}
              title={t('generation.addReference')}
              disabled={!host || addingReference}
              onClick={toggle}
            >
              <PlusIcon size={16} />
            </button>
          )}
        >
          <div className="selection-generation-input-panel__popover-title">
            {t('generation.referenceSource')}
          </div>
          <button
            type="button"
            data-canvas-generation-reference-source="workspace"
            onClick={() => void addReference('reference').catch(reportFailure)}
          >
            <strong>{t('generation.referenceWorkspace')}</strong>
            <small>{t('generation.referenceWorkspaceDescription')}</small>
          </button>
          <button
            type="button"
            data-canvas-generation-reference-source="import"
            onClick={() => void addReference('import').catch(reportFailure)}
          >
            <strong>{t('generation.referenceImport')}</strong>
            <small>{t('generation.referenceImportDescription')}</small>
          </button>
        </ComposerPopover>
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
              <strong>{t('generation.references')}</strong>
              <small>{t('generation.referenceDropHint')}</small>
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
          <GenerationModelSelector
            availableModels={availableModels}
            selectedBinding={recipe.model}
            selectedModel={selectedModel}
            unavailable={modelBindingUnavailable}
            onSelect={selectModel}
          />
          <span className="selection-generation-input-panel__control-divider" aria-hidden="true" />
          <KindParameters
            recipe={recipe}
            parameterProfile={selectedModel?.parameterProfile}
            onChange={setRecipe}
            onCommit={commitRecipe}
            onFailure={reportFailure}
          />
          {recipe.kind === 'image' ? (
            <>
              <span
                className="selection-generation-input-panel__control-divider"
                aria-hidden="true"
              />
              <ImageOutputCountSelector
                recipe={recipe}
                onChange={setRecipe}
                onCommit={commitRecipe}
                onFailure={reportFailure}
              />
            </>
          ) : null}
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
          data-running={active ? 'true' : undefined}
          type="button"
          aria-label={active ? t('generation.cancel') : t('generation.run')}
          title={active ? t('generation.cancel') : t('generation.run')}
          disabled={
            !active && (!recipe.prompt.trim() || !recipe.model || modelBindingUnavailable || !host)
          }
          onClick={() => void runOrCancel().catch(reportFailure)}
        >
          {active ? <StopIcon size={15} /> : <PlayIcon size={15} />}
        </button>
      </div>

      {!recipe.model && availableModels.length === 0 ? (
        <div className="selection-generation-input-panel__warning" role="status">
          {t('generation.noModelsForPurpose')}
        </div>
      ) : null}
      {modelBindingUnavailable ? (
        <div className="selection-generation-input-panel__diagnostic" role="alert">
          {t('generation.modelUnavailable')}
        </div>
      ) : null}
      {modelParameterProfileUnavailable ? (
        <div className="selection-generation-input-panel__diagnostic" role="alert">
          {t('generation.parameterProfileUnavailable')}
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

function GenerationModelSelector({
  availableModels,
  selectedBinding,
  selectedModel,
  unavailable,
  onSelect,
}: {
  readonly availableModels: readonly CanvasGenerationModelOption[];
  readonly selectedBinding: CanvasGenerationModelBinding | undefined;
  readonly selectedModel: CanvasGenerationModelOption | undefined;
  readonly unavailable: boolean;
  readonly onSelect: (option: CanvasGenerationModelOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = selectedModel?.label ?? selectedBinding?.modelId ?? t('generation.selectModel');
  return (
    <ComposerPopover
      open={open}
      onOpenChange={setOpen}
      anchorClassName="selection-generation-input-panel__model-anchor"
      contentClassName="selection-generation-input-panel__popover selection-generation-input-panel__model-menu"
      trigger={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          className="selection-generation-input-panel__chip selection-generation-input-panel__model-trigger"
          aria-label={t('generation.model')}
          aria-expanded={open}
          aria-invalid={unavailable || undefined}
          disabled={availableModels.length === 0}
        >
          <span className="selection-generation-input-panel__model-copy">
            <strong>{label}</strong>
            <small>
              {selectedModel?.providerLabel ??
                (unavailable ? t('generation.unavailable') : t('generation.model'))}
            </small>
          </span>
          <ChevronDownIcon size={13} />
        </button>
      )}
    >
      <div className="selection-generation-input-panel__popover-title">{t('generation.model')}</div>
      <div className="selection-generation-input-panel__model-options" role="menu">
        {availableModels.map((option) => {
          const selected = modelBindingsEqual(option.binding, selectedBinding);
          return (
            <button
              key={modelBindingKey(option.binding)}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className="selection-generation-input-panel__model-option"
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
            >
              <span>
                <strong>{option.label}</strong>
                <small>{option.providerLabel}</small>
              </span>
              {selected ? <CheckIcon size={15} /> : null}
            </button>
          );
        })}
      </div>
    </ComposerPopover>
  );
}

function KindParameters({
  recipe,
  parameterProfile,
  onChange,
  onCommit,
  onFailure,
}: {
  readonly recipe: CanvasGenerationRecipe;
  readonly parameterProfile: CanvasGenerationModelOption['parameterProfile'];
  readonly onChange: (recipe: CanvasGenerationRecipe) => void;
  readonly onCommit: (recipe: CanvasGenerationRecipe) => Promise<void>;
  readonly onFailure: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const apply = (next: CanvasGenerationRecipe): void => {
    onChange(next);
    void onCommit(next).catch(onFailure);
  };
  const content = parameterContent(recipe, parameterProfile, apply);
  const summary = parameterSummary(recipe);
  if (!content) return null;
  return (
    <ComposerPopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      anchorClassName="selection-generation-input-panel__parameter-anchor"
      contentClassName="selection-generation-input-panel__popover selection-generation-input-panel__parameter-menu"
      trigger={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          className="selection-generation-input-panel__chip selection-generation-input-panel__parameter-trigger"
          aria-label={t('generation.parameters')}
          aria-expanded={open}
        >
          <SettingsIcon size={14} />
          <span>{summary}</span>
          <ChevronDownIcon size={13} />
        </button>
      )}
    >
      {content}
    </ComposerPopover>
  );
}

function ImageOutputCountSelector({
  recipe,
  onChange,
  onCommit,
  onFailure,
}: {
  readonly recipe: Extract<CanvasGenerationRecipe, { readonly kind: 'image' }>;
  readonly onChange: (recipe: CanvasGenerationRecipe) => void;
  readonly onCommit: (recipe: CanvasGenerationRecipe) => Promise<void>;
  readonly onFailure: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = recipe.count ?? 1;
  const selectCount = (nextCount: 1 | 2 | 3 | 4): void => {
    const next = { ...recipe, count: nextCount };
    onChange(next);
    setOpen(false);
    void onCommit(next).catch(onFailure);
  };
  return (
    <ComposerPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      anchorClassName="selection-generation-input-panel__count-anchor"
      contentClassName="selection-generation-input-panel__popover selection-generation-input-panel__count-menu"
      trigger={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          className="selection-generation-input-panel__chip selection-generation-input-panel__count-trigger"
          aria-label={t('generation.count')}
          aria-expanded={open}
        >
          <span>× {count}</span>
        </button>
      )}
    >
      <div className="selection-generation-input-panel__count-title">{t('generation.count')}</div>
      <div className="selection-generation-input-panel__count-options" role="menu">
        {([1, 2, 3, 4] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={option === count}
            onClick={() => selectCount(option)}
          >
            × {option}
          </button>
        ))}
      </div>
    </ComposerPopover>
  );
}

function ComposerPopover({
  align = 'start',
  anchorClassName,
  children,
  contentClassName,
  onOpenChange,
  open,
  trigger,
}: {
  readonly align?: 'start' | 'end';
  readonly anchorClassName?: string;
  readonly children: ReactNode;
  readonly contentClassName: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly trigger: (toggle: () => void) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    left: 16,
    top: 16,
    maxHeight: 560,
    maxWidth: 620,
    composerWidth: 520,
  });
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !contentRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = (): void => {
      const trigger = rootRef.current;
      const content = contentRef.current;
      if (!trigger || !content) return;
      const triggerBounds = trigger.getBoundingClientRect();
      const canvasBounds =
        trigger
          .closest<HTMLElement>('[data-canvas-viewport-root="true"]')
          ?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      const composer = trigger.closest<HTMLElement>('[data-canvas-generation-input="true"]');
      const composerBounds = composer?.getBoundingClientRect();
      const measuredComposerWidth = composerBounds?.width ?? 0;
      const composerWidth =
        measuredComposerWidth > 0
          ? measuredComposerWidth
          : Number.parseFloat(composer?.style.width ?? '') || 520;
      const contentBounds = content.getBoundingClientRect();
      const edgeInset = 16;
      const gap = 8;
      const boundaryLeft = canvasBounds.left + edgeInset;
      const boundaryRight = canvasBounds.right - edgeInset;
      const boundaryTop = canvasBounds.top + edgeInset;
      const boundaryBottom = canvasBounds.bottom - edgeInset;
      const maxWidth = Math.max(0, boundaryRight - boundaryLeft);
      const effectiveWidth = Math.min(contentBounds.width, maxWidth);
      const maximumLeft = Math.max(boundaryLeft, boundaryRight - effectiveWidth);
      const alignedLeft =
        align === 'end' ? triggerBounds.right - effectiveWidth : triggerBounds.left;
      const aboveSpace = Math.max(0, triggerBounds.top - boundaryTop - gap);
      const belowSpace = Math.max(0, boundaryBottom - triggerBounds.bottom - gap);
      const placeAbove = contentBounds.height <= aboveSpace || aboveSpace >= belowSpace;
      const availableHeight = placeAbove ? aboveSpace : belowSpace;
      const effectiveHeight = Math.min(contentBounds.height, availableHeight);
      const preferredTop = placeAbove
        ? triggerBounds.top - gap - effectiveHeight
        : triggerBounds.bottom + gap;
      const maximumTop = Math.max(boundaryTop, boundaryBottom - effectiveHeight);
      setPosition({
        left: clamp(alignedLeft, boundaryLeft, maximumLeft),
        top: clamp(preferredTop, boundaryTop, maximumTop),
        maxHeight: availableHeight,
        maxWidth,
        composerWidth,
      });
    };
    updatePosition();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updatePosition);
    if (contentRef.current) observer?.observe(contentRef.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, open]);

  return (
    <div
      ref={rootRef}
      className={['selection-generation-input-panel__popover-anchor', anchorClassName]
        .filter(Boolean)
        .join(' ')}
      data-popover-align={align}
    >
      {trigger(() => onOpenChange(!open))}
      {open
        ? createPortal(
            <div
              ref={contentRef}
              className={contentClassName}
              style={
                {
                  left: position.left,
                  top: position.top,
                  maxWidth: position.maxWidth,
                  maxHeight: position.maxHeight,
                  '--generation-input-panel-width': `${position.composerWidth}px`,
                } as CSSProperties
              }
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function parameterContent(
  recipe: CanvasGenerationRecipe,
  parameterProfile: CanvasGenerationModelOption['parameterProfile'],
  apply: (next: CanvasGenerationRecipe) => void,
): ReactNode {
  switch (recipe.kind) {
    case 'prompt':
      return (
        <div className="selection-generation-input-panel__parameter-content">
          <OptionGroup
            label={t('generation.temperature')}
            value={recipe.temperature}
            options={[undefined, 0.2, 0.7, 1]}
            format={(value) => value?.toString() ?? t('generation.auto')}
            onSelect={(temperature) => apply({ ...recipe, temperature })}
          />
          <OptionGroup
            label={t('generation.maxTokens')}
            value={recipe.maxOutputTokens}
            options={[undefined, 512, 1024, 2048, 4096]}
            format={(value) => value?.toString() ?? t('generation.auto')}
            onSelect={(maxOutputTokens) => apply({ ...recipe, maxOutputTokens })}
          />
        </div>
      );
    case 'image': {
      if (parameterProfile?.kind !== 'image') return null;
      const { controls } = parameterProfile;
      return (
        <div className="selection-generation-input-panel__parameter-content">
          <OptionGroup
            label={t('generation.aspectRatio')}
            value={recipe.aspectRatio}
            options={controls.aspectRatio.values}
            format={(value) => value ?? t('generation.auto')}
            visualRatio
            layout="ratio"
            onSelect={(aspectRatio) =>
              apply(withImageResolution({ ...recipe, aspectRatio }, imageResolutionEdge(recipe)))
            }
          />
          <OptionGroup
            label={t('generation.resolution')}
            value={imageResolutionEdge(recipe)}
            options={integerControlOptions(controls.resolution)}
            format={(value) => `${(value ?? 1024) / 1024}K`}
            layout="equal"
            onSelect={(edge) => apply(withImageResolution(recipe, edge))}
          />
          <OptionGroup
            label={t('generation.quality')}
            value={imageQualityProfileValue(recipe.quality)}
            options={controls.quality.values}
            format={(value) =>
              value === 'standard'
                ? t('generation.qualityMedium')
                : value === 'hd'
                  ? t('generation.qualityHigh')
                  : t('generation.qualityLow')
            }
            layout="compact"
            onSelect={(quality) => apply({ ...recipe, quality: imageQualityRecipeValue(quality) })}
          />
        </div>
      );
    }
    case 'video': {
      if (parameterProfile?.kind !== 'video') return null;
      const { controls } = parameterProfile;
      return (
        <div className="selection-generation-input-panel__parameter-content">
          {controls.aspectRatio ? (
            <OptionGroup<string | undefined>
              label={t('generation.aspectRatio')}
              value={recipe.aspectRatio}
              options={stringControlOptions(controls.aspectRatio)}
              format={(value) => value ?? t('generation.auto')}
              visualRatio
              onSelect={(aspectRatio) => apply({ ...recipe, aspectRatio })}
            />
          ) : null}
          {controls.resolution ? (
            <OptionGroup<string | undefined>
              label={t('generation.resolution')}
              value={recipe.resolution}
              options={stringControlOptions(controls.resolution)}
              format={(value) => value ?? t('generation.auto')}
              onSelect={(resolution) => apply({ ...recipe, resolution })}
            />
          ) : null}
          {controls.duration ? (
            <OptionGroup<number | undefined>
              label={t('generation.duration')}
              value={recipe.duration}
              options={integerControlOptions(controls.duration)}
              format={(value) => (value ? `${value}s` : t('generation.auto'))}
              onSelect={(duration) => apply({ ...recipe, duration })}
            />
          ) : null}
          {controls.fps ? (
            <OptionGroup<number | undefined>
              label={t('generation.frameRate')}
              value={recipe.fps}
              options={integerControlOptions(controls.fps)}
              format={(value) => (value ? `${value} fps` : t('generation.auto'))}
              onSelect={(fps) => apply({ ...recipe, fps })}
            />
          ) : null}
          {controls.generateAudio ? (
            <OptionGroup<boolean | undefined>
              label={t('generation.generateAudio')}
              value={recipe.generateAudio}
              options={controls.generateAudio.required ? [false, true] : [undefined, false, true]}
              format={(value) =>
                value === undefined
                  ? t('generation.auto')
                  : value
                    ? t('generation.enabled')
                    : t('generation.disabled')
              }
              onSelect={(generateAudio) => apply({ ...recipe, generateAudio })}
            />
          ) : null}
        </div>
      );
    }
    case 'audio':
      return (
        <div className="selection-generation-input-panel__parameter-content">
          <OptionGroup
            label={t('generation.duration')}
            value={recipe.duration}
            options={[undefined, 10, 30, 60]}
            format={(value) => (value ? `${value}s` : t('generation.auto'))}
            onSelect={(duration) => apply({ ...recipe, duration })}
          />
          <OptionGroup
            label={t('generation.format')}
            value={recipe.format}
            options={[undefined, 'mp3', 'wav', 'flac'] as const}
            format={(value) => value?.toUpperCase() ?? t('generation.auto')}
            onSelect={(format) => apply({ ...recipe, format })}
          />
        </div>
      );
  }
}

function imageQualityProfileValue(
  quality: Extract<CanvasGenerationRecipe, { readonly kind: 'image' }>['quality'],
): string {
  return quality ?? 'low';
}

function imageQualityRecipeValue(
  quality: string,
): Extract<CanvasGenerationRecipe, { readonly kind: 'image' }>['quality'] {
  if (quality === 'low') return undefined;
  if (quality === 'standard' || quality === 'hd') return quality;
  throw new Error(`Unsupported image quality '${quality}'.`);
}

function OptionGroup<T extends string | number | boolean | undefined>({
  label,
  value,
  options,
  format,
  onSelect,
  visualRatio = false,
  layout = 'equal',
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly T[];
  readonly format: (value: T) => string;
  readonly onSelect: (value: T) => void;
  readonly visualRatio?: boolean;
  readonly layout?: 'ratio' | 'equal' | 'compact';
}) {
  return (
    <fieldset
      className="selection-generation-input-panel__option-group"
      data-option-layout={layout}
    >
      <legend>{label}</legend>
      <div className="selection-generation-input-panel__option-grid">
        {options.map((option) => (
          <button
            key={option === undefined ? 'auto' : String(option)}
            type="button"
            aria-label={`${label}: ${format(option)}`}
            aria-pressed={option === value}
            className={option === value ? 'active' : undefined}
            onClick={() => onSelect(option)}
          >
            {visualRatio && typeof option === 'string' ? (
              <span
                className="selection-generation-input-panel__ratio"
                style={ratioStyle(option)}
              />
            ) : null}
            {format(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function parameterSummary(recipe: CanvasGenerationRecipe): string {
  switch (recipe.kind) {
    case 'prompt':
      return [
        recipe.temperature === undefined ? t('generation.auto') : `T ${recipe.temperature}`,
        recipe.maxOutputTokens ? `${recipe.maxOutputTokens}` : undefined,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'image': {
      const resolutionEdge = imageResolutionEdge(recipe);
      return [
        recipe.aspectRatio ?? t('generation.auto'),
        resolutionEdge ? `${resolutionEdge / 1024}K` : undefined,
        recipe.quality === 'hd'
          ? t('generation.qualityHigh')
          : recipe.quality === 'standard'
            ? t('generation.qualityMedium')
            : t('generation.qualityLow'),
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'video':
      return (
        [recipe.aspectRatio, recipe.resolution, recipe.duration && `${recipe.duration}s`]
          .filter(Boolean)
          .join(' · ') || t('generation.parameters')
      );
    case 'audio':
      return [
        t('generation.audioMode'),
        recipe.duration && `${recipe.duration}s`,
        recipe.format?.toUpperCase(),
      ]
        .filter(Boolean)
        .join(' · ');
  }
}

function imageResolutionEdge(
  recipe: Extract<CanvasGenerationRecipe, { readonly kind: 'image' }>,
): number | undefined {
  return recipe.width && recipe.height ? Math.max(recipe.width, recipe.height) : undefined;
}

function withImageResolution(
  recipe: Extract<CanvasGenerationRecipe, { readonly kind: 'image' }>,
  edge: number | undefined,
): Extract<CanvasGenerationRecipe, { readonly kind: 'image' }> {
  if (!edge) {
    const { width: _width, height: _height, ...withoutResolution } = recipe;
    return withoutResolution;
  }
  const [widthRatio, heightRatio] = parseRatio(recipe.aspectRatio);
  const landscape = widthRatio >= heightRatio;
  return {
    ...recipe,
    width: landscape ? edge : roundToEight((edge * widthRatio) / heightRatio),
    height: landscape ? roundToEight((edge * heightRatio) / widthRatio) : edge,
  };
}

function parseRatio(value: string | undefined): readonly [number, number] {
  if (!value) return [1, 1];
  const [width, height] = value.split(':').map(Number);
  return width && height ? [width, height] : [1, 1];
}

function roundToEight(value: number): number {
  return Math.max(8, Math.round(value / 8) * 8);
}

function ratioStyle(value: string): { readonly width: number; readonly height: number } {
  const [width, height] = parseRatio(value);
  const scale = 18 / Math.max(width, height);
  return { width: Math.max(5, width * scale), height: Math.max(5, height * scale) };
}

function modelBindingsEqual(
  left: CanvasGenerationModelBinding | undefined,
  right: CanvasGenerationModelBinding | undefined,
): boolean {
  return (
    left !== undefined && right !== undefined && modelBindingKey(left) === modelBindingKey(right)
  );
}

function modelBindingKey(binding: CanvasGenerationModelBinding): string {
  return [binding.purpose, binding.providerId, binding.modelId].join('\u0000');
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

function referenceSourceKind(
  kind: CanvasGenerationRecipe['kind'],
): 'image' | 'video' | 'audio' | 'document' {
  switch (kind) {
    case 'prompt':
      return 'document';
    case 'image':
      return 'image';
    case 'video':
      return 'image';
    case 'audio':
      return 'audio';
  }
}

function hasGenerationReferenceDragPayload(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  const types = Array.from(dataTransfer.types);
  return types.includes(CONTENT_LOCATOR_DRAG_MIME) || types.includes('application/json');
}

function readGenerationReferenceDragPayload(
  dataTransfer: Pick<DataTransfer, 'getData'>,
  recipeKind: CanvasGenerationRecipe['kind'],
): {
  readonly locator: ReturnType<typeof parseContentLocatorDragData>['locator'];
  readonly mediaKind: CanvasMaterialMediaKind;
  readonly title: string;
} {
  const serialized =
    dataTransfer.getData(CONTENT_LOCATOR_DRAG_MIME) || dataTransfer.getData('application/json');
  if (!serialized) throw new Error(t('generation.referenceDropInvalid'));
  const payload = parseContentLocatorDragData(JSON.parse(serialized));
  const mediaKind = generationReferenceMediaKind(payload.name);
  if (!isCompatibleGenerationReference(recipeKind, mediaKind)) {
    throw new Error(t('generation.referenceDropIncompatible'));
  }
  return { locator: payload.locator, mediaKind, title: payload.name };
}

function generationReferenceMediaKind(name: string): CanvasMaterialMediaKind {
  const mediaType = inferCanvasMediaType(name);
  if (mediaType) return mediaType;
  if (/\.(md|markdown|txt|pdf|epub|docx?)$/iu.test(name)) return 'document';
  return 'other';
}

function isCompatibleGenerationReference(
  recipeKind: CanvasGenerationRecipe['kind'],
  mediaKind: CanvasMaterialMediaKind,
): boolean {
  switch (recipeKind) {
    case 'prompt':
      return mediaKind === 'document';
    case 'image':
    case 'video':
      return mediaKind === 'image';
    case 'audio':
      return mediaKind === 'audio';
  }
}

function basename(value: string): string {
  return value.split('/').filter(Boolean).at(-1) ?? '';
}

export function resolveUntouchedRecipeConfiguredDefault(
  node: GenerationCanvasNode,
  connections: readonly CanvasConnection[],
  models: readonly CanvasGenerationModelOption[],
): CanvasGenerationRecipe | undefined {
  if (
    node.data.latestRun ||
    node.data.outputs.length > 0 ||
    node.data.selectedOutputId ||
    connections.some((connection) => connection.targetId === node.id) ||
    !isUntouchedGenerationRecipe(node.data.recipe)
  ) {
    return undefined;
  }
  const purpose = purposeForCanvasGenerationRecipe(node.data.recipe);
  const defaultModel = models.find(
    (option) => option.isDefault && option.binding.purpose === purpose,
  );
  if (!defaultModel) return undefined;
  return createCanvasGenerationNodeData(
    node.data.recipe.kind,
    defaultModel.binding,
    defaultModel.parameterProfile,
  ).recipe;
}

function stringControlOptions(control: {
  readonly required: boolean;
  readonly values: readonly string[];
}): readonly (string | undefined)[] {
  return control.required ? control.values : [undefined, ...control.values];
}

function integerControlOptions(control: {
  readonly required: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suggestedValues?: readonly number[];
}): readonly (number | undefined)[] {
  const values =
    control.suggestedValues ??
    Array.from(
      { length: Math.floor((control.max - control.min) / control.step) + 1 },
      (_, index) => control.min + index * control.step,
    );
  return control.required ? values : [undefined, ...values];
}

function isUntouchedGenerationRecipe(recipe: CanvasGenerationRecipe): boolean {
  if (recipe.model || recipe.prompt.trim()) return false;
  switch (recipe.kind) {
    case 'prompt':
      return (
        (recipe.temperature === undefined || recipe.temperature === 0.7) &&
        (recipe.maxOutputTokens === undefined || recipe.maxOutputTokens === 2048)
      );
    case 'image':
      return (
        !recipe.negativePrompt?.trim() &&
        !recipe.style?.trim() &&
        (recipe.aspectRatio === undefined || recipe.aspectRatio === '1:1') &&
        (recipe.width === undefined || recipe.width === 1024) &&
        (recipe.height === undefined || recipe.height === 1024) &&
        (recipe.count === undefined || recipe.count === 1) &&
        (recipe.quality === undefined || recipe.quality === 'standard')
      );
    case 'video':
      return (
        !recipe.negativePrompt?.trim() &&
        !recipe.cameraMovement?.trim() &&
        recipe.motionStrength === undefined &&
        (recipe.aspectRatio === undefined || recipe.aspectRatio === '16:9') &&
        (recipe.resolution === undefined || recipe.resolution === '720p') &&
        (recipe.duration === undefined || recipe.duration === 5) &&
        (recipe.fps === undefined || recipe.fps === 24)
      );
    case 'audio':
      return (
        !recipe.negativePrompt?.trim() &&
        (recipe.duration === undefined || recipe.duration === 10) &&
        (recipe.format === undefined || recipe.format === 'mp3')
      );
  }
}

function recipesEqual(left: CanvasGenerationRecipe, right: CanvasGenerationRecipe): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resolveGenerationInputPanelPosition(
  node: GenerationCanvasNode,
  viewport: CanvasViewport,
  viewportSize: {
    readonly width: number;
    readonly height: number;
  },
  kind?: CanvasGenerationRecipe['kind'],
  measuredPanelHeight?: number,
): {
  readonly x: number;
  readonly top: number;
  readonly width: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly placement: 'node-below';
} {
  const viewportHeight = Math.max(0, viewportSize.height);
  const edgeInset = 16;
  const nodeGap = 16;
  const { width, minHeight } = resolveGenerationInputPanelMetrics(
    viewportSize,
    kind,
    measuredPanelHeight,
  );
  const nodeLeft = viewport.pan.x + node.position.x * viewport.zoom;
  const nodeTop = viewport.pan.y + node.position.y * viewport.zoom;
  const nodeRight = nodeLeft + node.size.width * viewport.zoom;
  const nodeBottom = nodeTop + node.size.height * viewport.zoom;
  const x = (nodeLeft + nodeRight) / 2;
  const top = nodeBottom + nodeGap;
  return {
    x,
    top,
    width,
    minHeight,
    maxHeight: Math.max(minHeight, viewportHeight - edgeInset * 2),
    placement: 'node-below',
  };
}

export function resolveGenerationSelectionSafePan(
  node: GenerationCanvasNode,
  viewport: CanvasViewport,
  viewportSize: { readonly width: number; readonly height: number },
  measuredPanelHeight?: number,
): { readonly x: number; readonly y: number } | undefined {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) return undefined;

  const edgeInset = 16;
  const nodeGap = 16;
  const metrics = resolveGenerationInputPanelMetrics(
    viewportSize,
    node.data.recipe.kind,
    measuredPanelHeight,
  );
  const nodeLeft = viewport.pan.x + node.position.x * viewport.zoom;
  const nodeTop = viewport.pan.y + node.position.y * viewport.zoom;
  const nodeRight = nodeLeft + node.size.width * viewport.zoom;
  const nodeBottom = nodeTop + node.size.height * viewport.zoom;
  const minimumCenter = edgeInset + metrics.width / 2;
  const maximumCenter = Math.max(minimumCenter, viewportSize.width - edgeInset - metrics.width / 2);
  const nodeCenter = (nodeLeft + nodeRight) / 2;
  const shiftX = clamp(nodeCenter, minimumCenter, maximumCenter) - nodeCenter;
  const stackTop = resolveSelectionToolbarTop(nodeTop, viewport.zoom, true);
  const stackBottom = nodeBottom + nodeGap + metrics.panelHeight;
  const availableHeight = viewportSize.height - edgeInset * 2;
  const stackHeight = stackBottom - stackTop;
  let shiftY = 0;
  if (stackHeight <= availableHeight) {
    if (stackTop < edgeInset) shiftY = edgeInset - stackTop;
    if (stackBottom + shiftY > viewportSize.height - edgeInset) {
      shiftY += viewportSize.height - edgeInset - (stackBottom + shiftY);
    }
  }
  if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) return undefined;
  return { x: viewport.pan.x + shiftX, y: viewport.pan.y + shiftY };
}

function resolveGenerationInputPanelMetrics(
  viewportSize: { readonly width: number; readonly height: number },
  kind: CanvasGenerationRecipe['kind'] | undefined,
  measuredPanelHeight: number | undefined,
): { readonly width: number; readonly minHeight: number; readonly panelHeight: number } {
  const viewportWidth = Math.max(0, viewportSize.width);
  const edgeInset = 16;
  const width = Math.min(520, Math.max(280, viewportWidth - edgeInset * 2));
  const minHeight =
    viewportWidth <= 520 ? (kind === 'audio' ? 264 : 224) : kind === 'audio' ? 244 : 210;
  return { width, minHeight, panelHeight: Math.max(minHeight, measuredPanelHeight ?? 0) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
