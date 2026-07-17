import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type {
  CanvasBlock,
  CanvasNode,
  CanvasStoryboardActionIntent,
  CanvasStoryboardPromptBlockKind,
  CanvasStoryboardPromptState,
  CanvasStoryboardSemanticPromptDocument,
  ChildNodeSlot,
} from '@neko/shared';
import {
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  getContainerChildIds,
  getNodeParentId,
  isCanvasStoryboardPromptState,
} from '@neko/shared';
import { createBuiltInBlockRendererRegistry, renderCanvasBlock } from './blockRendererRegistry';
import { SemanticPromptText } from '../common/SemanticPromptText';
import { ShotCanvasReviewSurface } from './ShotCanvasReviewSurface';
import type {
  BlockRendererRegistry,
  ContainerRendererProps,
  NodeContentRenderContext,
  NodeContentLayoutContext,
} from './types';
import {
  CardPreviewSlot,
  createBuiltInNodeCardPolicyRegistry,
  dispatchNodeCardAction,
  evaluateActionCondition,
  getNodeCardPolicy,
  NODE_CARD_ACTION_DISPATCHER,
  readNumber,
  readString,
  resolveShotReviewPreviewSource,
} from './node-card';
import type {
  CreatorSceneViewMode,
  SceneShotTableColumnId,
  SceneShotTableColumnProfileId,
  SceneShotTableFilterId,
  SceneShotTableRow,
} from './creatorPresentation';
import {
  filterSceneShotTableRows,
  projectSceneShotTableRows,
  resolveSceneShotTableColumns,
} from './creatorPresentation';
import { useCanvasStore } from '../../stores/canvasStore';
import { useClipboardStore } from '../../stores/clipboardStore';
import { useHistoryStore } from '../../stores/historyStore';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import type {
  CardActionDescriptor,
  CardBadge,
  CardPreviewAspectRatio,
  CardPreviewSource,
} from './node-card';
import type { NodeCardVariant } from './node-card';
import { t } from '../../i18n';
import { resolveCanvasStatusLabel } from '../../i18n/canvasValueLabels';

const MAX_CONTENT_DEPTH = 8;
const NODE_CARD_POLICY_REGISTRY = createBuiltInNodeCardPolicyRegistry();
const INLINE_FORM_CONTROL_CLASS =
  'min-w-0 rounded border border-[var(--node-border)] bg-white px-2 py-1 text-gray-900 outline-none focus:border-[var(--node-selected)]';
const INLINE_TEXTAREA_CONTROL_CLASS =
  'min-h-[76px] resize-none rounded border border-[var(--node-border)] bg-white px-2 py-1 text-gray-900 outline-none focus:border-[var(--node-selected)]';
const INLINE_TEXT_OWNED_KEYS = [
  'Backspace',
  'Delete',
  'Enter',
  'Escape',
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
] as const;
const SCENE_TOOL_SELECT_CLASS =
  'min-w-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 outline-none focus:border-[var(--node-selected)]';

const SCENE_COLUMN_LABELS: Record<SceneShotTableColumnId, string> = {
  shot: 'scene.column.shot',
  'reference-media': 'scene.column.referenceMedia',
  'image-prompt': 'scene.column.imagePrompt',
  'video-prompt': 'scene.column.videoPrompt',
  duration: 'scene.column.duration',
  dialogue: 'scene.column.dialogue',
  state: 'scene.column.state',
  action: 'scene.column.action',
};

const SCENE_TABLE_COLUMN_WIDTHS: Record<SceneShotTableColumnId, number> = {
  shot: 76,
  'reference-media': 132,
  'image-prompt': 216,
  'video-prompt': 248,
  duration: 72,
  dialogue: 176,
  state: 128,
  action: 112,
};

const SCENE_FILTER_OPTIONS = [
  { id: 'all', label: 'scene.filterAll' },
  { id: 'missing-image', label: 'scene.filterMissingImage' },
  { id: 'missing-dialogue', label: 'scene.filterMissingDialogue' },
  { id: 'failed-generation', label: 'scene.filterFailedGeneration' },
  { id: 'ungenerated', label: 'scene.filterUngenerated' },
  { id: 'has-diagnostics', label: 'scene.filterHasDiagnostics' },
  { id: 'current-character', label: 'scene.filterCurrentCharacter' },
  { id: 'current-scene-tag', label: 'scene.filterCurrentSceneTag' },
] as const satisfies readonly { id: SceneShotTableFilterId; label: string }[];

export function ContainerRenderer({ section, context }: ContainerRendererProps) {
  const blockRendererRegistry = useMemo(() => createBuiltInBlockRendererRegistry(), []);
  const [isCollapsed, setIsCollapsed] = useState(() => resolveDefaultCollapsed(section, context));

  useEffect(() => {
    // Re-apply surface-specific defaults, such as overlay sections that must open
    // even if the same section was manually collapsed on the canvas surface.
    setIsCollapsed(resolveDefaultCollapsed(section, context));
  }, [context.layout.surface, section.defaultCollapsed, section.id, section.metadata]);

  if (!isSectionVisible(section.visibleWhen, context)) {
    return null;
  }

  if (context.depth > MAX_CONTENT_DEPTH) {
    return (
      <div className="p-2 text-xs" style={{ color: 'var(--danger-fg)' }}>
        {t('content.depthLimitReached')}
      </div>
    );
  }

  if (isShotCanvasReviewSection(section, context)) {
    return <ShotCanvasReviewSurface context={context} />;
  }

  const sectionCollapsible = section.collapsible === true;
  const sectionFillMode = resolveSectionFillMode(section, context);

  return (
    <div
      className={getSectionClassName(section.layout, sectionFillMode, context.contentChrome)}
      data-container-section-id={section.id}
      data-container-section-fill={sectionFillMode}
    >
      {section.title &&
        (sectionCollapsible ? (
          <button
            type="button"
            className="flex w-full items-center gap-1 text-xs font-medium text-[var(--node-fg-secondary)] hover:text-[var(--node-fg)]"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setIsCollapsed((prev) => !prev)}
          >
            <span className="text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
            {resolveLabel(section.title)}
          </button>
        ) : (
          <div className="text-xs font-medium text-[var(--node-fg-secondary)]">
            {resolveLabel(section.title)}
          </div>
        ))}
      {(!sectionCollapsible || !isCollapsed) && (
        <>
          {section.blocks?.map((block) =>
            renderContentBlock(blockRendererRegistry, block, {
              ...context,
              depth: context.depth + 1,
            }),
          )}
          {section.sections?.map((childSection) => (
            <ContainerRenderer
              key={childSection.id}
              section={childSection}
              context={{ ...context, depth: context.depth + 1 }}
            />
          ))}
          {section.childSlots?.map((slot) => {
            const childIds = resolveSlotChildIds(context.node, context.allNodes, slot.childIds);
            const childNodes = childIds
              .map((childId) => context.allNodes.find((candidate) => candidate.id === childId))
              .filter((node): node is CanvasNode => Boolean(node));
            const presentation = resolveChildSlotPresentation(context.node, slot);
            const slotLayout = resolveChildSlotLayout(
              context.node,
              slot,
              context.layout,
              presentation,
            );
            return (
              <div
                key={slot.id}
                className={getChildSlotFrameClassName(presentation, context.layout.surface)}
                data-child-slot-id={slot.id}
                data-child-slot-variant={slotLayout.cardVariant}
                data-child-slot-kind={presentation}
                data-child-slot-overflow={context.layout.overflow}
                data-child-slot-card-height={slotLayout.cardHeight}
                data-child-slot-card-max-height={slotLayout.maxCardHeight}
              >
                {childNodes.length === 0 ? (
                  <span className="px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
                    {resolveLabel(slot.emptyLabel) ?? t('content.children')}
                  </span>
                ) : (
                  renderChildSlotContent({
                    presentation,
                    parentNode: context.node,
                    childNodes,
                    context,
                    slotLayout,
                  })
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function renderChildSlotContent({
  presentation,
  parentNode,
  childNodes,
  context,
  slotLayout,
}: {
  presentation: ChildSlotPresentation;
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  switch (presentation) {
    case 'scene-shot-table':
      return (
        <SceneShotReviewSurface
          parentNode={parentNode}
          childNodes={childNodes}
          context={context}
          slotLayout={slotLayout}
        />
      );
    case 'scene-shot-rail':
      return (
        <SceneShotRail
          parentNode={parentNode}
          childNodes={childNodes}
          rows={projectSceneShotTableRows(parentNode, childNodes)}
          context={context}
          slotLayout={slotLayout}
        />
      );
    case 'group-summary':
      return (
        <GroupReviewSurface
          parentNode={parentNode}
          childNodes={childNodes}
          context={context}
          slotLayout={slotLayout}
        />
      );
    case 'gallery-grid':
      return (
        <GalleryReviewSurface
          parentNode={parentNode}
          childNodes={childNodes}
          context={context}
          slotLayout={slotLayout}
        />
      );
    case 'detail-cards':
      return (
        <ChildSummaryGrid
          className={slotLayout.className}
          style={slotLayout.style}
          childNodes={childNodes}
          renderChild={(child) => (
            <ChildNodeDetailCard
              key={child.id}
              parentNode={parentNode}
              childNode={child}
              context={context}
              variant={slotLayout.cardVariant}
              style={slotLayout.cardStyle}
            />
          )}
        />
      );
  }
}

function isShotCanvasReviewSection(
  section: ContainerRendererProps['section'],
  context: ContainerRendererProps['context'],
): boolean {
  return (
    context.layout.surface === 'canvas' &&
    context.node.type === 'shot' &&
    section.metadata?.['presentation'] === 'shot-canvas-review'
  );
}

function ChildSummaryGrid({
  className,
  style,
  childNodes,
  renderChild,
}: {
  className: string;
  style?: React.CSSProperties;
  childNodes: readonly CanvasNode[];
  renderChild: (child: CanvasNode, index: number) => React.ReactNode;
}): React.ReactNode {
  return (
    <div className={className} style={style}>
      {childNodes.map((child, index) => renderChild(child, index))}
    </div>
  );
}

function GalleryReviewSurface({
  parentNode,
  childNodes,
  context,
  slotLayout,
}: {
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  const [mode, setMode] = useState<'visual-grid' | 'review-list'>('visual-grid');

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-2 overflow-hidden"
      data-gallery-review-surface="true"
      data-gallery-review-mode={mode}
    >
      <div className="flex min-w-0 items-center gap-1.5 px-2 text-[11px] text-gray-600">
        <div
          className="flex flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-white"
          role="group"
          aria-label={t('gallery.viewMode')}
        >
          <button
            type="button"
            className={getSceneToolButtonClassName(mode === 'visual-grid')}
            onClick={() => setMode('visual-grid')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('gallery.visualGrid')}
          </button>
          <button
            type="button"
            className={getSceneToolButtonClassName(mode === 'review-list')}
            onClick={() => setMode('review-list')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('gallery.reviewList')}
          </button>
        </div>
        <span className="ml-auto flex-shrink-0 text-[10px] text-gray-500">
          {t('gallery.viewCountCompact', { count: childNodes.length })}
        </span>
      </div>
      {mode === 'review-list' ? (
        <GalleryReviewList parentNode={parentNode} childNodes={childNodes} />
      ) : (
        <ChildSummaryGrid
          className={slotLayout.className}
          style={slotLayout.style}
          childNodes={childNodes}
          renderChild={(child, index) => (
            <GalleryChildCard
              key={child.id}
              parentNode={parentNode}
              childNode={child}
              index={index}
              context={context}
              style={slotLayout.cardStyle}
            />
          )}
        />
      )}
    </div>
  );
}

function GalleryReviewList({
  parentNode,
  childNodes,
}: {
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
}): React.ReactNode {
  return (
    <div
      className="min-h-0 min-w-0 flex-1 basis-0 overflow-auto px-2 pb-2"
      data-gallery-review-list="true"
    >
      <table className="min-w-[720px] table-fixed border-collapse text-left text-[11px] text-gray-700">
        <colgroup>
          <col style={{ width: 72 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 260 }} />
          <col style={{ width: 108 }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50 text-[10px] uppercase tracking-normal text-gray-500">
          <tr>
            <th className="border border-gray-200 px-2 py-1.5 font-medium">
              {t('gallery.column.order')}
            </th>
            <th className="border border-gray-200 px-2 py-1.5 font-medium">
              {t('gallery.column.label')}
            </th>
            <th className="border border-gray-200 px-2 py-1.5 font-medium">
              {t('gallery.column.status')}
            </th>
            <th className="border border-gray-200 px-2 py-1.5 font-medium">
              {t('gallery.column.prompt')}
            </th>
            <th className="border border-gray-200 px-2 py-1.5 font-medium">
              {t('gallery.column.reference')}
            </th>
          </tr>
        </thead>
        <tbody>
          {childNodes.map((childNode, index) => {
            const placement = readChildPlacementMetadata(parentNode, childNode.id);
            const prompt =
              readString(placement, 'prompt') ?? resolveChildSummaryText(childNode, undefined);
            const status =
              readString(placement, 'generationStatus') ??
              readString(childNode.data, 'generationStatus');
            return (
              <tr key={childNode.id} data-gallery-review-row-id={childNode.id} className="bg-white">
                <td className="border border-gray-200 px-2 py-2 align-top">
                  {resolveGalleryChildOrdinal(parentNode, childNode, index)}
                </td>
                <td className="border border-gray-200 px-2 py-2 align-top">
                  <BoundedSceneCellText
                    value={
                      readString(placement, 'label') ?? childNode.preview?.title ?? childNode.id
                    }
                    placeholder={t('scene.valueUnavailable')}
                  />
                </td>
                <td className="border border-gray-200 px-2 py-2 align-top">
                  <BoundedSceneCellText
                    value={status ? resolveCanvasStatusLabel(status) : ''}
                    placeholder={t('scene.valueUnavailable')}
                  />
                </td>
                <td className="border border-gray-200 px-2 py-2 align-top">
                  <BoundedSceneCellText value={prompt} placeholder={t('scene.valueUnavailable')} />
                </td>
                <td className="border border-gray-200 px-2 py-2 align-top">
                  <BoundedSceneCellText
                    value={childNode.id}
                    placeholder={t('scene.valueUnavailable')}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupReviewSurface({
  parentNode,
  childNodes,
  context,
  slotLayout,
}: {
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  const [mode, setMode] = useState<'overview' | 'type-list'>('overview');
  const typeCounts = useMemo(() => summarizeChildTypeCounts(childNodes), [childNodes]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-2 overflow-hidden"
      data-group-review-surface="true"
      data-group-review-mode={mode}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-2 text-[11px] text-gray-600">
        <div
          className="flex flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-white"
          role="group"
          aria-label={t('group.viewMode')}
        >
          <button
            type="button"
            className={getSceneToolButtonClassName(mode === 'overview')}
            onClick={() => setMode('overview')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('group.overview')}
          </button>
          <button
            type="button"
            className={getSceneToolButtonClassName(mode === 'type-list')}
            onClick={() => setMode('type-list')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('group.typeList')}
          </button>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1">
          {typeCounts.map((entry) => (
            <span key={entry.type} className={getChildBadgeClassName('info')}>
              {resolveNodeTypeLabelByType(entry.type)}: {entry.count}
            </span>
          ))}
        </div>
      </div>
      {mode === 'type-list' ? (
        <GroupTypeList childNodes={childNodes} />
      ) : (
        <ChildSummaryGrid
          className={slotLayout.className}
          style={slotLayout.style}
          childNodes={childNodes}
          renderChild={(child) => (
            <GroupChildSummaryCard
              key={child.id}
              parentNode={parentNode}
              childNode={child}
              context={context}
              variant={slotLayout.cardVariant}
              style={slotLayout.cardStyle}
            />
          )}
        />
      )}
    </div>
  );
}

function GroupTypeList({ childNodes }: { childNodes: readonly CanvasNode[] }): React.ReactNode {
  const groups = useMemo(() => groupChildrenByType(childNodes), [childNodes]);
  return (
    <div
      className="min-h-0 min-w-0 flex-1 basis-0 overflow-auto px-2 pb-2 text-[11px] text-gray-700"
      data-group-type-list="true"
    >
      {groups.map((group) => (
        <section key={group.type} className="mb-2 rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-2 py-1 font-medium">
            {group.type} · {group.children.length}
          </div>
          <div className="divide-y divide-gray-100">
            {group.children.map((child) => (
              <div key={child.id} className="flex min-w-0 gap-2 px-2 py-1.5">
                <span className="w-24 flex-shrink-0 truncate text-gray-500">{child.type}</span>
                <span className="min-w-0 flex-1 truncate">
                  {child.preview?.title ?? resolveChildSummaryText(child, child.preview?.subtitle)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SceneShotReviewSurface({
  parentNode,
  childNodes,
  context,
  slotLayout,
}: {
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  const [viewMode, setViewMode] = useState<CreatorSceneViewMode>('storyboard-table');
  const [columnProfileId, setColumnProfileId] =
    useState<SceneShotTableColumnProfileId>('creator-review');
  const [filterId, setFilterId] = useState<SceneShotTableFilterId>('all');
  const [currentCharacterFilter, setCurrentCharacterFilter] = useState<string | undefined>();
  const [currentSceneTagFilter, setCurrentSceneTagFilter] = useState<string | undefined>();
  const [sortId, setSortId] = useState<'scene-order' | 'status'>('scene-order');
  const rows = useMemo(
    () => projectSceneShotTableRows(parentNode, childNodes),
    [childNodes, parentNode],
  );
  const scenePromptState = useMemo(() => readSceneStoryboardPromptState(parentNode), [parentNode]);
  const sceneSummary = useMemo(
    () => createSceneReviewSummary(parentNode, rows),
    [parentNode, rows],
  );
  const activeColumns = useMemo(
    () => resolveSceneShotTableColumns(columnProfileId),
    [columnProfileId],
  );
  const characterFilterOptions = useMemo(
    () => uniqueDisplayStrings(rows.flatMap((row) => row.characterNames)),
    [rows],
  );
  const sceneTagFilterOptions = useMemo(
    () => uniqueDisplayStrings(rows.flatMap((row) => row.sceneTags)),
    [rows],
  );
  const visibleRows = useMemo(() => {
    const filtered = filterSceneShotTableRows(rows, filterId, {
      currentCharacter: currentCharacterFilter ?? characterFilterOptions[0],
      currentSceneTag: currentSceneTagFilter ?? sceneTagFilterOptions[0],
    });
    if (sortId === 'status') {
      return [...filtered].sort((left, right) => left.status.localeCompare(right.status));
    }
    return filtered;
  }, [
    characterFilterOptions,
    currentCharacterFilter,
    currentSceneTagFilter,
    filterId,
    rows,
    sceneTagFilterOptions,
    sortId,
  ]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-2 overflow-hidden"
      data-scene-review-surface="true"
      data-scene-view-mode={viewMode}
    >
      <SceneReviewHeader summary={sceneSummary} promptState={scenePromptState} />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-2 text-[11px] text-gray-600">
        <div
          className="flex flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-white"
          role="group"
          aria-label={t('scene.viewMode')}
        >
          <button
            type="button"
            className={getSceneToolButtonClassName(viewMode === 'storyboard-table')}
            onClick={() => setViewMode('storyboard-table')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('scene.storyboardTable')}
          </button>
          <button
            type="button"
            className={getSceneToolButtonClassName(viewMode === 'creative-view')}
            onClick={() => setViewMode('creative-view')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('scene.creativeView')}
          </button>
        </div>
        {viewMode === 'storyboard-table' ? (
          <>
            <label className="flex min-w-[112px] items-center gap-1">
              <span className="text-gray-500">{t('scene.fields')}</span>
              <select
                className={SCENE_TOOL_SELECT_CLASS}
                value={columnProfileId}
                onChange={(event) =>
                  setColumnProfileId(event.target.value as SceneShotTableColumnProfileId)
                }
                onMouseDown={(event) => event.stopPropagation()}
              >
                <option value="creator-review">{t('scene.profileCreatorReview')}</option>
                <option value="professional">{t('scene.profileProfessional')}</option>
              </select>
            </label>
            <label className="flex min-w-[128px] items-center gap-1">
              <span className="text-gray-500">{t('scene.filter')}</span>
              <select
                className={SCENE_TOOL_SELECT_CLASS}
                value={filterId}
                onChange={(event) => setFilterId(event.target.value as SceneShotTableFilterId)}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {SCENE_FILTER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </label>
            {filterId === 'current-character' ? (
              <label className="flex min-w-[128px] items-center gap-1">
                <span className="text-gray-500">{t('scene.character')}</span>
                <select
                  className={SCENE_TOOL_SELECT_CLASS}
                  value={currentCharacterFilter ?? characterFilterOptions[0] ?? ''}
                  onChange={(event) => setCurrentCharacterFilter(event.target.value || undefined)}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {characterFilterOptions.length === 0 ? (
                    <option value="">{t('scene.valueUnavailable')}</option>
                  ) : (
                    characterFilterOptions.map((character) => (
                      <option key={character} value={character}>
                        {character}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
            {filterId === 'current-scene-tag' ? (
              <label className="flex min-w-[128px] items-center gap-1">
                <span className="text-gray-500">{t('scene.tag')}</span>
                <select
                  className={SCENE_TOOL_SELECT_CLASS}
                  value={currentSceneTagFilter ?? sceneTagFilterOptions[0] ?? ''}
                  onChange={(event) => setCurrentSceneTagFilter(event.target.value || undefined)}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {sceneTagFilterOptions.length === 0 ? (
                    <option value="">{t('scene.valueUnavailable')}</option>
                  ) : (
                    sceneTagFilterOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
            <label className="flex min-w-[112px] items-center gap-1">
              <span className="text-gray-500">{t('scene.sort')}</span>
              <select
                className={SCENE_TOOL_SELECT_CLASS}
                value={sortId}
                onChange={(event) => setSortId(event.target.value as 'scene-order' | 'status')}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <option value="scene-order">{t('scene.sortSceneOrder')}</option>
                <option value="status">{t('scene.sortStatus')}</option>
              </select>
            </label>
            <span className="ml-auto flex-shrink-0 text-[10px] text-gray-500">
              {t('scene.shotCountCompact', { count: visibleRows.length })}
            </span>
          </>
        ) : null}
      </div>
      {viewMode === 'creative-view' ? (
        <SceneShotRail
          parentNode={parentNode}
          childNodes={childNodes}
          rows={rows}
          context={context}
          slotLayout={slotLayout}
        />
      ) : (
        <SceneShotTable
          parentNode={parentNode}
          rows={visibleRows}
          columns={activeColumns}
          context={context}
        />
      )}
    </div>
  );
}

interface SceneReviewSummary {
  readonly title: string;
  readonly metaLine: string;
  readonly metrics: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: string;
  }[];
}

function SceneReviewHeader({
  summary,
  promptState,
}: {
  summary: SceneReviewSummary;
  promptState?: CanvasStoryboardPromptState;
}): React.ReactNode {
  const document = promptState?.promptBlocks?.videoPromptDocument;
  return (
    <section
      className="mx-2 min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 shadow-sm"
      data-scene-review-header="true"
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="truncate text-[12px] font-semibold text-slate-900"
            data-scene-review-title="true"
          >
            {summary.title}
          </div>
          {summary.metaLine ? (
            <div
              className="mt-0.5 truncate text-[10px] text-slate-500"
              data-scene-review-meta="true"
            >
              {summary.metaLine}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap justify-end gap-1" data-scene-review-metrics="true">
          {summary.metrics.map((metric) => (
            <span
              key={metric.id}
              className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-none text-slate-600"
              data-scene-review-metric={metric.id}
              title={`${metric.label}: ${metric.value}`}
            >
              <span className="text-slate-400">{metric.label}</span>
              <span className="truncate font-medium text-slate-700">{metric.value}</span>
            </span>
          ))}
        </div>
      </div>
      <div data-scene-video-prompt-summary="true">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-normal text-slate-500">
          {t('scene.column.videoPrompt')}
        </div>
        <SemanticPromptText
          text={document?.text ?? ''}
          spans={document?.spans}
          placeholder={t('scene.valueUnavailable')}
          ariaLabel={t('scene.column.videoPrompt')}
          className="line-clamp-3 min-w-0 whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-[11px] leading-[1.45] text-slate-700"
          placeholderClassName="text-slate-400"
        />
      </div>
    </section>
  );
}

function SceneShotTable({
  parentNode,
  rows,
  columns,
  context,
}: {
  parentNode: CanvasNode;
  rows: readonly SceneShotTableRow[];
  columns: readonly SceneShotTableColumnId[];
  context: ContainerRendererProps['context'];
}): React.ReactNode {
  if (rows.length === 0) {
    return (
      <div
        className="mx-2 flex min-h-[120px] items-center justify-center rounded border border-dashed border-gray-200 bg-white/70 px-3 py-4 text-xs text-gray-500"
        data-scene-shot-table-empty="true"
      >
        {t('scene.tableEmpty')}
      </div>
    );
  }

  return (
    <div
      className="min-h-0 min-w-0 flex-1 basis-0 overflow-auto px-2 pb-2"
      data-scene-shot-table="true"
      data-node-drag-block="true"
    >
      <table
        className="table-fixed border-collapse text-left text-[11px] text-gray-700"
        style={{ minWidth: resolveSceneTableMinWidth(columns) }}
      >
        <colgroup>
          {columns.map((columnId) => (
            <col key={columnId} style={{ width: SCENE_TABLE_COLUMN_WIDTHS[columnId] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50 text-[10px] uppercase tracking-normal text-gray-500">
          <tr>
            {columns.map((columnId) => (
              <th
                key={columnId}
                className="border border-gray-200 px-2 py-1.5 font-medium"
                data-scene-shot-table-column={columnId}
              >
                {t(SCENE_COLUMN_LABELS[columnId])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SceneShotTableRowView
              key={row.id}
              parentNode={parentNode}
              row={row}
              columns={columns}
              context={context}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SceneShotTableRowView({
  parentNode,
  row,
  columns,
  context,
}: {
  parentNode: CanvasNode;
  row: SceneShotTableRow;
  columns: readonly SceneShotTableColumnId[];
  context: ContainerRendererProps['context'];
}): React.ReactNode {
  const isSelected = context.selectedNodeIds.includes(row.node.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === row.node.id);
  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(row.node.id, event.shiftKey || event.metaKey);
    },
    [context, row.node.id],
  );
  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: row.node.id,
      node: row.node,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [parentNode.id, row.node]);
  const handleDispatchActionIntent = useCallback(() => {
    if (!row.nextActionId) return;
    getGlobalVSCodeApi()?.postMessage({
      type: 'storyboardActionIntent',
      intent: createStoryboardActionIntent(parentNode, row),
    });
  }, [parentNode, row]);

  return (
    <tr
      className={
        isSelected || isPlaybackActive
          ? 'bg-blue-50 outline outline-1 outline-[var(--node-selected)]'
          : 'bg-white hover:bg-gray-50'
      }
      data-scene-shot-table-row-id={row.id}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {columns.map((columnId) => (
        <td
          key={columnId}
          className={getSceneTableCellClassName(columnId)}
          data-scene-shot-table-cell={columnId}
        >
          {renderSceneShotTableCell(columnId, row, {
            context,
            onOpenDetails: handleOpenDetails,
            onDispatchActionIntent: handleDispatchActionIntent,
          })}
        </td>
      ))}
    </tr>
  );
}

function renderSceneShotTableCell(
  columnId: SceneShotTableColumnId,
  row: SceneShotTableRow,
  options: {
    context: ContainerRendererProps['context'];
    onOpenDetails: () => void;
    onDispatchActionIntent: () => void;
  },
): React.ReactNode {
  switch (columnId) {
    case 'shot':
      return (
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 text-left text-[12px] font-medium text-gray-900 hover:text-blue-700"
          title={t('scene.openShotDetail')}
          onClick={(event) => {
            event.stopPropagation();
            options.onOpenDetails();
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] leading-none text-white">
            {row.ordinal}
          </span>
          <span className="truncate">{row.shotNumber}</span>
        </button>
      );
    case 'reference-media':
      return <SceneReferenceMediaCell row={row} />;
    case 'image-prompt':
      return (
        <ScenePromptCellText
          document={row.imagePromptDocument}
          value={row.imagePrompt}
          placeholder={t('scene.imagePromptSkipped')}
          ariaLabel={t('scene.column.imagePrompt')}
        />
      );
    case 'video-prompt':
      return (
        <ScenePromptCellText
          document={row.videoPromptDocument}
          value={row.videoPrompt}
          placeholder={t('scene.valueUnavailable')}
          ariaLabel={t('scene.column.videoPrompt')}
        />
      );
    case 'duration':
      return (
        <BoundedSceneCellText
          value={row.duration}
          placeholder={t('scene.valueUnavailable')}
          ariaLabel={t('scene.column.duration')}
        />
      );
    case 'dialogue':
      return (
        <BoundedSceneCellText
          value={row.dialogue}
          placeholder={t('scene.noDialogue')}
          ariaLabel={t('scene.column.dialogue')}
        />
      );
    case 'state':
      return <SceneShotStatusCell row={row} />;
    case 'action':
      return (
        <SceneShotActionCell row={row} onDispatchActionIntent={options.onDispatchActionIntent} />
      );
  }
}

function SceneReferenceMediaCell({ row }: { row: SceneShotTableRow }): React.ReactNode {
  const previewSource = resolveShotReviewPreviewSource(row.node);
  const visibleReferenceMedia = getVisibleReferenceMediaLabel(row.referenceMedia);
  const shouldRenderText = Boolean(visibleReferenceMedia || !row.referenceMedia);
  const title =
    visibleReferenceMedia ||
    (!row.referenceMedia ? t('scene.referenceMediaUnavailable') : undefined);
  return (
    <div
      className={
        shouldRenderText
          ? 'grid min-w-0 grid-cols-[minmax(72px,2fr)_minmax(0,1fr)] items-start gap-1.5'
          : 'grid min-w-0 grid-cols-[minmax(72px,1fr)] items-start gap-1.5'
      }
      data-scene-reference-media-cell="true"
      title={title}
    >
      <div
        className={
          shouldRenderText
            ? 'mx-auto flex max-h-[120px] w-fit max-w-full items-center justify-center overflow-hidden rounded border border-gray-200 bg-white [&_img]:max-h-[120px] [&_img]:max-w-full'
            : 'mx-auto flex max-h-[148px] w-fit max-w-full items-center justify-center overflow-hidden rounded border border-gray-200 bg-white [&_img]:max-h-[148px] [&_img]:max-w-full'
        }
        data-scene-reference-media-preview="true"
        data-scene-reference-media-preview-fit="intrinsic"
      >
        <CardPreviewSlot
          source={previewSource}
          title={row.shotNumber}
          variant="review-full"
          imageFit="contain"
        />
      </div>
      {shouldRenderText ? (
        <BoundedSceneCellText
          value={visibleReferenceMedia}
          placeholder={t('scene.referenceMediaUnavailable')}
          ariaLabel={t('scene.referenceMediaStatus')}
        />
      ) : null}
    </div>
  );
}

function getVisibleReferenceMediaLabel(value: string): string {
  return isMachineReferenceMediaSummary(value) ? '' : value;
}

function isMachineReferenceMediaSummary(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(?:(?:image|video|audio):\d+\s*)+$/iu.test(trimmed);
}

function readSceneStoryboardPromptState(node: CanvasNode): CanvasStoryboardPromptState | undefined {
  const state = readRecordValue(node.data)['storyboardPrompt'];
  return isCanvasStoryboardPromptState(state) ? state : undefined;
}

function SceneShotStatusCell({ row }: { row: SceneShotTableRow }): React.ReactNode {
  const stateLabel = formatSceneShotStateLabel(row.stateId, row.state);
  const stateTargetLabel = formatSceneShotStateTargetLabel(row.stateTarget);
  const tone =
    row.stateSeverity === 'blocked' || row.stateSeverity === 'error'
      ? 'error'
      : row.stateSeverity === 'warning' || row.diagnosticCount > 0
        ? 'warning'
        : 'neutral';
  return (
    <div
      className="flex min-w-0 flex-col gap-1"
      aria-label={`${t('scene.nextCreativeState')}: ${stateLabel}`}
    >
      <span className={getSceneStatusBadgeClassName(tone)}>{stateLabel}</span>
      {stateTargetLabel ? (
        <span className="text-[10px] text-gray-500">{stateTargetLabel}</span>
      ) : null}
    </div>
  );
}

function SceneShotActionCell({
  row,
  onDispatchActionIntent,
}: {
  row: SceneShotTableRow;
  onDispatchActionIntent: () => void;
}): React.ReactNode {
  if (!row.nextActionId) {
    return (
      <BoundedSceneCellText
        value=""
        placeholder={t('scene.valueUnavailable')}
        ariaLabel={t('scene.nextActionControl')}
      />
    );
  }
  const actionLabel =
    formatSceneShotActionLabel(row.nextActionId) || row.actionLabel || row.nextActionId;
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] leading-none text-blue-700 hover:bg-blue-100"
      data-scene-shot-action-id={row.nextActionId}
      title={row.nextActionId}
      aria-label={`${t('scene.nextActionControl')}: ${actionLabel}`}
      onClick={(event) => {
        event.stopPropagation();
        onDispatchActionIntent();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      {...getKeyboardBoundaryMetadata({
        scope: 'toolbar',
        ownerId: `scene-shot-action:${row.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
    >
      <span className="truncate">{actionLabel}</span>
    </button>
  );
}

function ScenePromptCellText({
  document,
  value,
  placeholder,
  ariaLabel,
}: {
  document?: CanvasStoryboardSemanticPromptDocument;
  value: string;
  placeholder: string;
  ariaLabel?: string;
}): React.ReactNode {
  return (
    <div data-scene-prompt-cell-text="true">
      <SemanticPromptText
        text={document?.text || value}
        spans={document?.spans}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.35] text-gray-700"
        placeholderClassName="text-gray-400"
      />
    </div>
  );
}

function BoundedSceneCellText({
  value,
  placeholder,
  ariaLabel,
}: {
  value: string;
  placeholder: string;
  ariaLabel?: string;
}): React.ReactNode {
  return (
    <div
      className="line-clamp-2 min-w-0 break-words text-[11px] leading-[1.35] text-gray-700"
      data-scene-cell-text-bounded="true"
      aria-label={ariaLabel}
      title={value || placeholder}
    >
      {value || <span className="text-gray-400">{placeholder}</span>}
    </div>
  );
}

function SceneShotCardParam({ label, value }: { label: string; value: string }): React.ReactNode {
  if (!value) return null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-none text-slate-600"
      title={`${label}: ${value}`}
    >
      <span className="text-slate-400">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function createSceneReviewSummary(
  sceneNode: CanvasNode,
  rows: readonly SceneShotTableRow[],
): SceneReviewSummary {
  const data = readRecordValue(sceneNode.data);
  const title = formatSceneReviewTitle(data);
  const metaLine = [readString(data, 'location'), readString(data, 'timeOfDay')]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  const totalSeconds = rows.reduce((total, row) => total + readSceneRowSeconds(row.duration), 0);
  const metrics = [
    {
      id: 'shots',
      label: t('scene.metricShots'),
      value: t('scene.shotCountCompact', { count: rows.length }),
    },
    {
      id: 'duration',
      label: t('scene.metricTotalDuration'),
      value:
        totalSeconds > 0
          ? t('scene.totalDuration', { seconds: formatDurationValue(totalSeconds) })
          : t('scene.valueUnavailable'),
    },
    {
      id: 'resolution',
      label: t('scene.metricResolution'),
      value: resolveSceneResolutionLabel(data),
    },
    {
      id: 'model',
      label: t('scene.metricModel'),
      value:
        readString(data, 'modelName') ?? readString(data, 'modelId') ?? t('scene.valueUnavailable'),
    },
    {
      id: 'status',
      label: t('scene.metricStatus'),
      value: resolveSceneStatusSummary(rows),
    },
  ];
  return { title, metaLine, metrics };
}

function formatSceneReviewTitle(data: Record<string, unknown>): string {
  const sceneNumber = readNumber(data, 'sceneNumber');
  const title = readString(data, 'sceneTitle');
  if (sceneNumber !== undefined && title)
    return `${t('preset.scene.number')} ${sceneNumber} · ${title}`;
  if (sceneNumber !== undefined) return `${t('preset.scene.number')} ${sceneNumber}`;
  return title ?? t('node.sceneGroup');
}

function resolveSceneResolutionLabel(data: Record<string, unknown>): string {
  const resolution = readString(data, 'resolution');
  if (resolution) return resolution;
  const width = readNumber(data, 'width') ?? readNumber(data, 'videoWidth');
  const height = readNumber(data, 'height') ?? readNumber(data, 'videoHeight');
  if (width !== undefined && height !== undefined) return `${width}x${height}`;
  return readString(data, 'aspectRatio') ?? t('scene.valueUnavailable');
}

function resolveSceneStatusSummary(rows: readonly SceneShotTableRow[]): string {
  if (rows.length === 0) return t('scene.valueUnavailable');
  const blockedCount = rows.filter(
    (row) => row.stateSeverity === 'blocked' || row.stateSeverity === 'error',
  ).length;
  if (blockedCount > 0) return t('scene.statusBlockedCount', { count: blockedCount });
  const pendingCount = rows.filter((row) => row.nextActionId).length;
  if (pendingCount > 0) return t('scene.statusPendingCount', { count: pendingCount });
  return t('scene.statusReady');
}

function readSceneRowSeconds(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)/u);
  return match ? Number(match[1]) : 0;
}

function formatDurationValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function resolvePreviewAspectRatio(
  previewSource: CardPreviewSource,
): CardPreviewAspectRatio | 'none' {
  if (
    previewSource.renderForm === 'asset-thumbnail' ||
    previewSource.renderForm === 'media-poster'
  ) {
    return previewSource.aspectRatio;
  }
  return 'none';
}

function GroupChildSummaryCard({
  parentNode,
  childNode,
  context,
  variant,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  context: ContainerRendererProps['context'];
  variant: NodeCardVariant;
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle = resolveChildSummaryText(childNode, policy.resolveSubtitle?.(childNode));
  const badges = policy.resolveBadges?.(childNode) ?? [];
  const isSelected = context.selectedNodeIds.includes(childNode.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);
  const childTypeLabel = resolveNodeTypeLabel(childNode);

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: childNode.id,
      node: childNode,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [childNode, parentNode.id]);

  const handleRemove = useCallback(() => {
    context.onRemoveChild?.(parentNode.id, childNode.id);
    if (!context.onRemoveChild) {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'remove', {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    }
  }, [childNode, context, parentNode.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      className={getGroupSummaryCardClassName(variant, isSelected, isPlaybackActive)}
      {...getKeyboardBoundaryMetadata({
        scope: 'container',
        ownerId: `container-child:${childNode.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
      style={style}
      data-group-child-card-id={childNode.id}
      data-group-child-card-layout="summary"
      data-group-child-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-gray-200 bg-white px-2 py-1.5">
        <span className="flex-shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] leading-none text-gray-500">
          {childTypeLabel}
        </span>
        <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-900">{title}</div>
        {badges.slice(0, 1).map((badge) => (
          <span key={badge.label} className={getChildBadgeClassName(badge.tone)}>
            {badge.label}
          </span>
        ))}
        <button
          type="button"
          className={getChildActionClassName({
            id: 'remove',
            label: 'action.remove',
            position: 'top-right',
            visibleWhen: 'always',
            danger: true,
          })}
          title={t('group.removeChild')}
          onClick={(event) => {
            event.stopPropagation();
            handleRemove();
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {t('action.removeShort')}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-2 bg-white px-2 py-2">
        <div className={getSummaryPreviewWrapperClassName(variant)}>
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant="summary-large"
            interactionRenderMode={context.interactionRenderMode}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <div className="line-clamp-3 min-h-[44px] text-[11px] leading-4 text-gray-600">
            {subtitle}
          </div>
          <button
            type="button"
            className="mt-auto self-start rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600 hover:border-blue-300 hover:text-blue-600"
            title={t('group.openChildDetail')}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenDetails();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('scene.openShotDetailShort')}
          </button>
        </div>
      </div>
    </div>
  );
}

function GalleryChildCard({
  parentNode,
  childNode,
  index,
  context,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  index: number;
  context: ContainerRendererProps['context'];
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle = resolveGalleryChildSummary(
    parentNode,
    childNode,
    policy.resolveSubtitle?.(childNode),
  );
  const badges = resolveGalleryChildBadges(
    parentNode,
    childNode,
    policy.resolveBadges?.(childNode) ?? [],
  );
  const actions = policy.resolveActions?.(childNode, parentNode) ?? [];
  const visibleActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, {
      node: childNode,
      parentNode,
      selection: { nodeIds: context.selectedNodeIds },
      previewSource,
    }),
  );
  const isSelected = context.selectedNodeIds.includes(childNode.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: childNode.id,
      node: childNode,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [childNode, parentNode.id]);

  const handleAction = useCallback(
    (actionId: CardActionDescriptor['id']) => {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [childNode, parentNode.id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={getGalleryChildCardClassName(isSelected, isPlaybackActive)}
      {...getKeyboardBoundaryMetadata({
        scope: 'container',
        ownerId: `gallery-child:${childNode.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
      style={style}
      data-gallery-child-card-id={childNode.id}
      data-gallery-child-card-layout="visual-grid"
      data-gallery-child-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        <CardPreviewSlot
          source={previewSource}
          title={title}
          variant="gallery"
          interactionRenderMode={context.interactionRenderMode}
        />
        <div className="absolute left-2 top-2 rounded border border-black/10 bg-white/90 px-1.5 py-0.5 text-[10px] leading-none text-gray-600 shadow-sm">
          {resolveGalleryChildOrdinal(parentNode, childNode, index)}
        </div>
      </div>
      <div className="flex min-h-[66px] flex-col gap-1 border-t border-gray-200 bg-white px-2 py-2 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-900">
            {title}
          </div>
          {badges.slice(0, 1).map((badge) => (
            <span key={badge.label} className={getChildBadgeClassName(badge.tone)}>
              {badge.label}
            </span>
          ))}
        </div>
        <div className="line-clamp-2 min-h-[30px] text-[11px] leading-4 text-gray-600">
          {subtitle}
        </div>
        <div className="mt-auto flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600 hover:border-blue-300 hover:text-blue-600"
            title={t('gallery.openItemDetail')}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenDetails();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {t('scene.openShotDetailShort')}
          </button>
          {visibleActions
            .filter((action) => action.id !== 'open-content-overlay')
            .slice(0, 2)
            .map((action) => (
              <button
                key={action.id}
                type="button"
                className={getChildActionClassName(action)}
                title={resolveChildActionTitle(action)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleAction(action.id);
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {resolveChildActionLabel(action)}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function SceneShotRail({
  parentNode,
  childNodes,
  rows,
  context,
  slotLayout,
}: {
  parentNode: CanvasNode;
  childNodes: readonly CanvasNode[];
  rows: readonly SceneShotTableRow[];
  context: ContainerRendererProps['context'];
  slotLayout: ChildSlotLayout;
}): React.ReactNode {
  const shotNodes = childNodes.filter((child) => child.type === 'shot');
  const rowByNodeId = useMemo(() => new Map(rows.map((row) => [row.node.id, row])), [rows]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2 px-2 text-[11px] text-gray-500">
        <span className="truncate font-medium">{t('scene.shotRail')}</span>
        <span className="flex-shrink-0">
          {t('scene.shotCountCompact', { count: shotNodes.length })}
        </span>
      </div>
      <div
        className="relative min-w-0 overflow-x-auto overflow-y-hidden px-2 pb-2 pt-1"
        data-scene-shot-rail="true"
        data-node-drag-block="true"
        aria-label={t('scene.shotRail')}
      >
        <div className="pointer-events-none absolute left-2 right-2 top-6 h-px bg-gray-200" />
        <div className="relative flex min-w-max flex-nowrap items-start gap-2">
          {childNodes.map((childNode, index) => (
            <SceneShotRailCard
              key={childNode.id}
              parentNode={parentNode}
              childNode={childNode}
              row={rowByNodeId.get(childNode.id)}
              index={index}
              context={context}
              style={slotLayout.cardStyle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneShotRailCard({
  parentNode,
  childNode,
  row,
  index,
  context,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  row?: SceneShotTableRow;
  index: number;
  context: ContainerRendererProps['context'];
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle =
    row?.imagePrompt ||
    policy.resolveSubtitle?.(childNode) ||
    readString(childNode.data, 'visualDescription');
  const badges = policy.resolveBadges?.(childNode) ?? [];
  const actions = policy.resolveActions?.(childNode, parentNode) ?? [];
  const visibleActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, {
      node: childNode,
      parentNode,
      selection: { nodeIds: context.selectedNodeIds },
      previewSource,
    }),
  );
  const isSelected = context.selectedNodeIds.includes(childNode.id);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);
  const duration = readNumber(childNode.data, 'duration');
  const stateLabel = row ? formatSceneShotStateLabel(row.stateId, row.state) : undefined;
  const stateTone = row
    ? row.stateSeverity === 'blocked' || row.stateSeverity === 'error'
      ? 'error'
      : row.stateSeverity === 'warning' || row.diagnosticCount > 0
        ? 'warning'
        : 'neutral'
    : undefined;

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleOpenDetails = useCallback(() => {
    dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, 'open-content-overlay', {
      nodeId: childNode.id,
      node: childNode,
      parentNodeId: parentNode.id,
      canvasStore: useCanvasStore.getState(),
      historyStore: useHistoryStore.getState(),
      clipboardStore: useClipboardStore.getState(),
      postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
    });
  }, [childNode, parentNode.id]);

  const handleAction = useCallback(
    (actionId: CardActionDescriptor['id']) => {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [childNode, parentNode.id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={getSceneShotRailCardClassName(isSelected, isPlaybackActive)}
      {...getKeyboardBoundaryMetadata({
        scope: 'container',
        ownerId: `scene-shot:${childNode.id}`,
        ownedKeys: ['Enter', 'Space'],
      })}
      style={style}
      data-scene-shot-card-id={childNode.id}
      data-scene-shot-card-layout="rail"
      data-scene-shot-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onDoubleClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-medium leading-none text-white">
          {index + 1}
        </span>
        <span className="truncate text-[11px] font-medium text-gray-900">{title}</span>
        {badges[0] ? (
          <span className={getChildBadgeClassName(badges[0].tone)}>{badges[0].label}</span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-2">
        <div
          className="flex h-[210px] min-w-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 [&_img]:max-h-[210px] [&_img]:max-w-full"
          data-scene-shot-card-preview="true"
          data-scene-shot-card-preview-aspect={resolvePreviewAspectRatio(previewSource)}
        >
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant="summary-large"
            imageFit="contain"
            interactionRenderMode={context.interactionRenderMode}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
          <div
            className="line-clamp-3 min-h-[42px] text-[10px] leading-4 text-slate-700"
            data-scene-shot-card-prompt="true"
          >
            {subtitle || t('scene.shotVisualFallback')}
          </div>
          <div className="flex min-w-0 flex-wrap gap-1" data-scene-shot-card-params="true">
            <SceneShotCardParam
              label={t('scene.column.duration')}
              value={
                row?.duration ||
                (duration !== undefined ? t('scene.shotDuration', { seconds: duration }) : '')
              }
            />
            {stateLabel && stateTone ? (
              <span
                className={getSceneStatusBadgeClassName(stateTone)}
                data-scene-shot-card-status="true"
              >
                {stateLabel}
              </span>
            ) : null}
            <SceneShotCardParam label={t('scene.column.mediaRefs')} value={row?.mediaRefs ?? ''} />
          </div>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1 border-t border-gray-100 px-2 py-1.5">
        <button
          type="button"
          className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600 hover:border-blue-300 hover:text-blue-600"
          title={t('scene.openShotDetail')}
          onClick={(event) => {
            event.stopPropagation();
            handleOpenDetails();
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {t('scene.openShotDetailShort')}
        </button>
        {visibleActions
          .filter((action) => action.id !== 'open-content-overlay')
          .slice(0, 2)
          .map((action) => (
            <button
              key={action.id}
              type="button"
              className={getChildActionClassName(action)}
              title={resolveChildActionTitle(action)}
              onClick={(event) => {
                event.stopPropagation();
                handleAction(action.id);
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {resolveChildActionLabel(action)}
            </button>
          ))}
      </div>
    </div>
  );
}

function ChildNodeDetailCard({
  parentNode,
  childNode,
  context,
  variant,
  style,
}: {
  parentNode: CanvasNode;
  childNode: CanvasNode;
  context: ContainerRendererProps['context'];
  variant: NodeCardVariant;
  style?: React.CSSProperties;
}): React.ReactNode {
  const policy = getNodeCardPolicy(NODE_CARD_POLICY_REGISTRY, childNode);
  const previewSource = policy.resolvePreviewSource(childNode);
  const title = policy.resolveTitle(childNode, parentNode);
  const subtitle = policy.resolveSubtitle?.(childNode);
  const badges = policy.resolveBadges?.(childNode) ?? [];
  const actions = policy.resolveActions?.(childNode, parentNode) ?? [];
  const fields = resolveInlineEditableFields(childNode);
  const hasPreview = shouldRenderCardPreview(previewSource, fields.length);
  const isPlaybackActive = useCanvasStore((state) => state.activePlayingNodeId === childNode.id);

  const handleSelect = useCallback(
    (event: React.MouseEvent) => {
      context.onSelectNode?.(childNode.id, event.shiftKey || event.metaKey);
    },
    [childNode.id, context],
  );

  const handleAction = useCallback(
    (actionId: CardActionDescriptor['id']) => {
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: childNode.id,
        node: childNode,
        parentNodeId: parentNode.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [childNode, parentNode.id],
  );

  return (
    <div
      className={getChildDetailCardClassName(variant, isPlaybackActive)}
      style={style}
      data-child-card-id={childNode.id}
      data-child-card-layout="detail"
      data-child-card-variant={variant}
      data-child-card-height={readStyleHeight(style)}
      data-playback-active={isPlaybackActive ? 'true' : undefined}
      onClick={handleSelect}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ChildCardHeader
        node={childNode}
        parentNode={parentNode}
        title={title}
        subtitle={subtitle}
        badges={badges}
        actions={actions}
        previewSource={previewSource}
        selection={{ nodeIds: context.selectedNodeIds }}
        onAction={handleAction}
      />
      {hasPreview ? (
        <div className="border-b border-[var(--node-border)] bg-white/70">
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant={variant === 'row' ? 'compact' : variant}
            interactionRenderMode={context.interactionRenderMode}
          />
        </div>
      ) : null}
      <div
        className="min-h-0 bg-white/80"
        data-child-detail-id={childNode.id}
        onClick={(event) => event.stopPropagation()}
      >
        <InlineChildFields childNode={childNode} context={context} fields={fields} />
      </div>
    </div>
  );
}

function ChildCardHeader({
  node,
  parentNode,
  title,
  subtitle,
  badges,
  actions,
  previewSource,
  selection,
  onAction,
}: {
  node: CanvasNode;
  parentNode: CanvasNode;
  title: string;
  subtitle?: string;
  badges: readonly CardBadge[];
  actions: readonly CardActionDescriptor[];
  previewSource: CardPreviewSource;
  selection: { nodeIds: readonly string[] };
  onAction: (actionId: CardActionDescriptor['id']) => void;
}): React.ReactNode {
  const enabledActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, { node, parentNode, selection, previewSource }),
  );

  return (
    <div
      className="flex min-w-0 items-center gap-2 border-b border-[var(--node-border)] bg-white px-2 py-1.5"
      data-child-card-header-id={node.id}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-gray-900">{title}</div>
        {subtitle ? (
          <div className="truncate text-[10px] leading-4 text-gray-500">{subtitle}</div>
        ) : null}
      </div>
      {badges.slice(0, 2).map((badge) => (
        <span key={badge.label} className={getChildBadgeClassName(badge.tone)}>
          {badge.label}
        </span>
      ))}
      <div className="flex flex-shrink-0 items-center gap-1">
        {enabledActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={getChildActionClassName(action)}
            title={resolveChildActionTitle(action)}
            onClick={(event) => {
              event.stopPropagation();
              onAction(action.id);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {resolveChildActionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  );
}

function InlineChildFields({
  childNode,
  context,
  fields,
}: {
  childNode: CanvasNode;
  context: ContainerRendererProps['context'];
  fields: readonly InlineEditableField[];
}): React.ReactNode {
  if (fields.length === 0) {
    return (
      <div className="px-2 py-1 text-xs text-[var(--node-fg-secondary)]">
        {childNode.preview?.subtitle ?? childNode.preview?.title ?? childNode.type}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 grid-cols-2 gap-2 p-2">
      {fields.map((field) => {
        const value = readChildFieldValue(childNode, field.key);
        const handleChange = (nextValue: string) => {
          context.onUpdateNodeData?.(childNode.id, {
            ...(childNode.data as Record<string, unknown>),
            [field.key]: field.kind === 'number' ? Number(nextValue) : nextValue,
          });
        };

        return (
          <label key={field.key} className={getInlineFieldClassName(field)}>
            <span className="text-[11px] text-gray-500">{field.label}</span>
            {field.kind === 'textarea' ? (
              <textarea
                className={INLINE_TEXTAREA_CONTROL_CLASS}
                value={value}
                {...getKeyboardBoundaryMetadata({
                  scope: 'inline-editor',
                  ownerId: `container-field:${childNode.id}:${field.key}`,
                  ownedKeys: INLINE_TEXT_OWNED_KEYS,
                })}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => handleChange(event.target.value)}
              />
            ) : (
              <input
                type={field.kind === 'number' ? 'number' : 'text'}
                className={INLINE_FORM_CONTROL_CLASS}
                value={value}
                {...getKeyboardBoundaryMetadata({
                  scope: 'inline-editor',
                  ownerId: `container-field:${childNode.id}:${field.key}`,
                  ownedKeys: INLINE_TEXT_OWNED_KEYS,
                })}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => handleChange(event.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function shouldRenderCardPreview(
  previewSource: CardPreviewSource,
  editableFieldCount: number,
): boolean {
  if (previewSource.renderForm === 'none') {
    return false;
  }
  if (previewSource.renderForm === 'text' && editableFieldCount > 0) {
    return false;
  }
  return true;
}

function getChildDetailCardClassName(variant: NodeCardVariant, isPlaybackActive = false): string {
  const base =
    'group/child-card min-w-0 overflow-hidden rounded border border-[var(--node-border)] bg-white text-left shadow-sm';
  const active = isPlaybackActive ? ' ring-2 ring-[var(--node-selected)] ring-offset-2' : '';
  if (variant === 'row') {
    return `${base}${active} flex flex-col`;
  }
  return `${base}${active} flex min-h-0 flex-col`;
}

function getSceneShotRailCardClassName(isSelected: boolean, isPlaybackActive = false): string {
  const base =
    'flex w-[320px] flex-shrink-0 cursor-pointer flex-col overflow-hidden rounded border bg-white text-left shadow-sm outline-none transition-colors focus:border-[var(--node-selected)] focus:ring-1 focus:ring-[var(--node-selected)]';
  return isSelected || isPlaybackActive
    ? `${base} border-[var(--node-selected)] ring-1 ring-[var(--node-selected)]`
    : `${base} border-gray-200 hover:border-blue-300`;
}

function getSceneToolButtonClassName(active: boolean): string {
  const base = 'px-2 py-1 text-[11px] leading-none transition-colors';
  return active
    ? `${base} bg-blue-600 text-white`
    : `${base} bg-white text-gray-600 hover:bg-gray-50`;
}

function getSceneTableCellClassName(columnId: SceneShotTableColumnId): string {
  const base = 'align-top border border-gray-200 px-2 py-2';
  if (columnId === 'shot' || columnId === 'state' || columnId === 'action') {
    return `${base} bg-white`;
  }
  return `${base} bg-white`;
}

function getSceneStatusBadgeClassName(tone: 'error' | 'warning' | 'neutral'): string {
  const base = 'inline-flex w-fit rounded border px-1.5 py-0.5 text-[10px] leading-none';
  if (tone === 'error') {
    return `${base} border-red-200 bg-red-50 text-red-700`;
  }
  if (tone === 'warning') {
    return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  }
  return `${base} border-gray-200 bg-gray-50 text-gray-600`;
}

function formatSceneShotStateLabel(stateId: string, fallback: string): string {
  const value = t(`scene.nextState.${stateId}`);
  if (value !== `scene.nextState.${stateId}`) {
    return value;
  }
  return fallback || t('scene.statusNeedsAction');
}

function formatSceneShotStateTargetLabel(target: string): string {
  if (!target) return '';
  const value = t(`scene.stateTarget.${target}`);
  return value === `scene.stateTarget.${target}` ? target : value;
}

function formatSceneShotActionLabel(actionId: SceneShotTableRow['nextActionId']): string {
  switch (actionId) {
    case 'process-reference':
      return t('scene.action.processReference');
    case 'optimize-image-prompt':
      return t('scene.action.optimizeImagePrompt');
    case 'optimize-video-prompt':
      return t('scene.action.optimizeVideoPrompt');
    case 'generate-image':
      return t('scene.action.generateImage');
    case 'generate-video':
      return t('scene.action.generateVideo');
    case 'review-result':
      return t('scene.action.reviewResult');
    case 'fix-alignment':
      return t('scene.action.fixAlignment');
    case 'accept-result':
      return t('scene.action.acceptResult');
    case 'retry':
      return t('scene.action.retry');
    case undefined:
      return '';
  }
}

function createStoryboardActionIntent(
  sceneNode: CanvasNode,
  row: SceneShotTableRow,
): CanvasStoryboardActionIntent {
  if (!row.nextActionId) {
    throw new Error(`Cannot create storyboard action intent without nextActionId for ${row.id}.`);
  }
  const promptState = readShotStoryboardPromptState(row.node);
  const scenePromptState = readSceneStoryboardPromptState(sceneNode);
  const promptDocuments = listPromptDocumentRefsForAction(
    row.nextActionId,
    promptState,
    scenePromptState,
    row.node.id,
  );
  return {
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    actionId: row.nextActionId,
    target: {
      nodeId: row.node.id,
      sceneNodeId: sceneNode.id,
      shotNumber: row.ordinal,
    },
    ...(promptDocuments.length > 0 ? { promptDocuments } : {}),
    ...(promptState?.referenceMedia ? { referenceMedia: promptState.referenceMedia } : {}),
    ...(promptState?.generationParams ? { generationParams: promptState.generationParams } : {}),
    expectedNextStateId: row.stateId,
    ...(promptState?.nextCreativeState?.taskRef
      ? { taskRef: promptState.nextCreativeState.taskRef }
      : {}),
    ...(promptState?.nextCreativeState?.resultRef
      ? { resultRef: promptState.nextCreativeState.resultRef }
      : {}),
    createdAt: Date.now(),
  };
}

function readShotStoryboardPromptState(node: CanvasNode): CanvasStoryboardPromptState | undefined {
  if (node.type !== 'shot') return undefined;
  const state = node.data.storyboardPrompt;
  if (state === undefined) return undefined;
  if (!isCanvasStoryboardPromptState(state)) {
    throw new Error(`Invalid storyboardPrompt state on shot node ${node.id}.`);
  }
  return state;
}

function listPromptDocumentRefsForAction(
  actionId: SceneShotTableRow['nextActionId'],
  shotState: CanvasStoryboardPromptState | undefined,
  sceneState: CanvasStoryboardPromptState | undefined,
  nodeId: string,
): NonNullable<CanvasStoryboardActionIntent['promptDocuments']> {
  if (!shotState?.promptBlocks && !sceneState?.promptBlocks) return [];
  const sceneVideoDocument = shouldUseSceneVideoPromptDocument(actionId, shotState)
    ? sceneState?.promptBlocks?.videoPromptDocument
    : undefined;
  const refs = [
    promptDocumentRef('image', shotState?.promptBlocks?.imagePromptDocument),
    promptDocumentRef('video', shotState?.promptBlocks?.videoPromptDocument ?? sceneVideoDocument),
    promptDocumentRef('voice', shotState?.promptBlocks?.voicePromptDocument),
  ].filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));
  if (refs.length === 0) {
    throw new Error(
      `Cannot create storyboard action intent without prompt document refs for ${nodeId}.`,
    );
  }
  return refs;
}

function shouldUseSceneVideoPromptDocument(
  actionId: SceneShotTableRow['nextActionId'],
  shotState: CanvasStoryboardPromptState | undefined,
): boolean {
  if (shotState?.promptBlocks?.videoPromptDocument) return false;
  return actionId === 'generate-video' || actionId === 'optimize-video-prompt';
}

function promptDocumentRef(
  blockKind: CanvasStoryboardPromptBlockKind,
  document: CanvasStoryboardSemanticPromptDocument | undefined,
): NonNullable<CanvasStoryboardActionIntent['promptDocuments']>[number] | undefined {
  if (!document) return undefined;
  return {
    blockKind,
    documentId: document.documentId,
    version: document.version,
    ...(document.baseRevision ? { baseRevision: document.baseRevision } : {}),
  };
}

function resolveSceneTableMinWidth(columns: readonly SceneShotTableColumnId[]): number {
  return columns.reduce((total, columnId) => total + SCENE_TABLE_COLUMN_WIDTHS[columnId], 0);
}

function getGroupSummaryCardClassName(
  variant: NodeCardVariant,
  isSelected: boolean,
  isPlaybackActive = false,
): string {
  const sizeClass = variant === 'row' ? 'min-h-[132px] w-full' : 'min-h-[156px] w-full';
  const base = `flex ${sizeClass} min-w-0 cursor-pointer flex-col overflow-hidden rounded border bg-white text-left shadow-sm outline-none transition-colors focus:border-[var(--node-selected)] focus:ring-1 focus:ring-[var(--node-selected)]`;
  return isSelected || isPlaybackActive
    ? `${base} border-[var(--node-selected)] ring-1 ring-[var(--node-selected)]`
    : `${base} border-gray-200 hover:border-blue-300`;
}

function getGalleryChildCardClassName(isSelected: boolean, isPlaybackActive = false): string {
  const base =
    'flex min-w-0 cursor-pointer flex-col overflow-hidden rounded border bg-white text-left shadow-sm outline-none transition-colors focus:border-[var(--node-selected)] focus:ring-1 focus:ring-[var(--node-selected)]';
  return isSelected || isPlaybackActive
    ? `${base} border-[var(--node-selected)] ring-1 ring-[var(--node-selected)]`
    : `${base} border-gray-200 hover:border-blue-300`;
}

function getSummaryPreviewWrapperClassName(variant: NodeCardVariant): string {
  if (variant === 'row') {
    return 'w-[96px] flex-shrink-0';
  }
  return 'w-[112px] flex-shrink-0';
}

function getChildSlotFrameClassName(
  presentation: ChildSlotPresentation,
  surface: ContainerRendererProps['context']['layout']['surface'],
): string {
  if (presentation === 'scene-shot-rail') {
    return 'flex min-h-0 min-w-0 flex-shrink-0 flex-col gap-1.5';
  }
  if (presentation === 'scene-shot-table') {
    return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5 overflow-hidden';
  }
  if (surface === 'overlay') {
    return 'flex min-h-0 min-w-0 flex-col gap-1.5 overflow-visible';
  }
  if (presentation === 'group-summary' || presentation === 'gallery-grid') {
    return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5 overflow-auto';
  }
  return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5 overflow-auto';
}

type ChildSlotPresentation =
  'scene-shot-table' | 'scene-shot-rail' | 'group-summary' | 'gallery-grid' | 'detail-cards';

function resolveChildSlotPresentation(
  node: CanvasNode,
  slot: ChildNodeSlot,
): ChildSlotPresentation {
  if (node.type === 'scene' && (slot.summaryRole === 'node-summary' || slot.layout === 'grid')) {
    return 'scene-shot-table';
  }
  if (node.type === 'gallery' && slot.layout === 'gallery') {
    return 'gallery-grid';
  }
  if (node.type === 'group' && (slot.summaryRole === 'node-summary' || slot.layout === 'grid')) {
    return 'group-summary';
  }
  return 'detail-cards';
}

function getInlineFieldClassName(field: InlineEditableField): string {
  const base = 'flex min-h-0 flex-col gap-1 text-xs';
  if (field.kind === 'textarea') {
    return `${base} col-span-2`;
  }
  return base;
}

function getChildBadgeClassName(tone: CardBadge['tone']): string {
  switch (tone) {
    case 'success':
      return 'flex-shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700';
    case 'warning':
      return 'flex-shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] leading-none text-amber-700';
    case 'error':
      return 'flex-shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] leading-none text-red-700';
    case 'info':
      return 'flex-shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] leading-none text-blue-700';
    default:
      return 'flex-shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] leading-none text-gray-600';
  }
}

function getChildActionClassName(action: CardActionDescriptor): string {
  const base =
    'rounded border px-1.5 py-0.5 text-[10px] leading-none transition-colors hover:bg-gray-50';
  return action.danger
    ? `${base} border-red-200 text-red-600 hover:bg-red-50`
    : `${base} border-gray-200 text-gray-600`;
}

function resolveChildActionLabel(action: CardActionDescriptor): string {
  switch (action.id) {
    case 'remove':
      return t('action.removeShort');
    case 'generate':
      return t('action.generateShort');
    case 'open-media-preview':
    case 'open-content-overlay':
      return t('action.openShort');
    case 'duplicate':
      return t('action.duplicateShort');
    case 'edit':
      return t('action.editShort');
    case 'open-in-editor':
      return t('action.fileShort');
  }
}

function resolveChildActionTitle(action: CardActionDescriptor): string {
  return isI18nKey(action.label) ? t(action.label) : action.label;
}

function resolveChildSummaryText(childNode: CanvasNode, subtitle: string | undefined): string {
  if (subtitle) {
    return subtitle;
  }

  const data = childNode.data as Record<string, unknown>;
  const candidates = [
    data['content'],
    data['visualDescription'],
    data['characterAction'],
    data['assetPath'],
    data['runtimeAssetPath'],
    data['sceneTitle'],
    data['label'],
    data['title'],
    childNode.preview?.subtitle,
    childNode.preview?.title,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return truncateSummary(candidate);
    }
  }

  return t('group.childNoSummary');
}

function resolveGalleryChildSummary(
  parentNode: CanvasNode,
  childNode: CanvasNode,
  subtitle: string | undefined,
): string {
  const placement = readChildPlacementMetadata(parentNode, childNode.id);
  const prompt = readString(placement, 'prompt');
  if (prompt) {
    return truncateSummary(prompt);
  }
  return resolveChildSummaryText(childNode, subtitle);
}

function resolveGalleryChildBadges(
  parentNode: CanvasNode,
  childNode: CanvasNode,
  badges: readonly CardBadge[],
): readonly CardBadge[] {
  const status = readString(
    readChildPlacementMetadata(parentNode, childNode.id),
    'generationStatus',
  );
  if (!status) {
    return badges;
  }
  return [{ label: resolveCanvasStatusLabel(status), tone: badgeToneForStatus(status) }, ...badges];
}

function resolveGalleryChildOrdinal(
  parentNode: CanvasNode,
  childNode: CanvasNode,
  index: number,
): string {
  const order = readNumber(readChildPlacementMetadata(parentNode, childNode.id), 'order');
  return String((order ?? index) + 1);
}

function readChildPlacementMetadata(
  parentNode: CanvasNode,
  childNodeId: string,
): Record<string, unknown> {
  const metadata = parentNode.container?.childPlacements?.[childNodeId]?.metadata;
  return readRecordValue(metadata);
}

function badgeToneForStatus(status: string): CardBadge['tone'] {
  switch (status) {
    case 'done':
    case 'ready':
    case 'complete':
      return 'success';
    case 'generating':
    case 'pending':
    case 'idle':
      return 'warning';
    case 'error':
    case 'failed':
      return 'error';
    default:
      return 'neutral';
  }
}

function resolveNodeTypeLabel(node: CanvasNode): string {
  return resolveNodeTypeLabelByType(node.type);
}

function resolveNodeTypeLabelByType(nodeType: CanvasNode['type']): string {
  const key = nodeType === 'scene' ? 'node.sceneGroup' : `node.${nodeType}`;
  const label = t(key);
  return label === key ? nodeType : label;
}

function summarizeChildTypeCounts(
  childNodes: readonly CanvasNode[],
): readonly { readonly type: CanvasNode['type']; readonly count: number }[] {
  const counts = new Map<CanvasNode['type'], number>();
  for (const child of childNodes) {
    counts.set(child.type, (counts.get(child.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => ({ type, count }));
}

function groupChildrenByType(
  childNodes: readonly CanvasNode[],
): readonly { readonly type: CanvasNode['type']; readonly children: readonly CanvasNode[] }[] {
  const groups = new Map<CanvasNode['type'], CanvasNode[]>();
  for (const child of childNodes) {
    const group = groups.get(child.type) ?? [];
    group.push(child);
    groups.set(child.type, group);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, children]) => ({ type, children }));
}

function truncateSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 71)}...` : normalized;
}

function readStyleHeight(style: React.CSSProperties | undefined): string | undefined {
  return typeof style?.height === 'string' ? style.height : undefined;
}

function readRecordValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function renderContentBlock(
  registry: BlockRendererRegistry,
  block: CanvasBlock,
  context: ContainerRendererProps['context'],
): React.ReactNode {
  if (!isSectionVisible(block.visibleWhen, context)) {
    return null;
  }

  return (
    <div
      key={block.id}
      data-content-block-id={block.id}
      className={getBlockFrameClassName(block, context.contentChrome)}
    >
      {renderCanvasBlock(registry, { ...context, block })}
    </div>
  );
}

function getBlockFrameClassName(
  block: CanvasBlock,
  contentChrome: NodeContentRenderContext['contentChrome'],
): string {
  if (isStretchBlock(block) || (contentChrome === 'full-bleed' && block.kind === 'asset-preview')) {
    return 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col';
  }

  return 'min-w-0';
}

function shouldFillSection(
  section: ContainerRendererProps['section'],
  context: ContainerRendererProps['context'],
): boolean {
  if (context.depth === 0) {
    return true;
  }

  return (
    section.childSlots !== undefined ||
    section.sections?.some((childSection) => childSection.childSlots !== undefined) ||
    (section.blocks?.some(isStretchBlock) ?? false)
  );
}

function resolveSectionFillMode(
  section: ContainerRendererProps['section'],
  context: ContainerRendererProps['context'],
): 'fill' | 'natural' {
  if (context.contentChrome === 'full-bleed') {
    return 'fill';
  }
  if (context.layout.surface === 'overlay' && !shouldFillSection(section, context)) {
    return 'natural';
  }

  return shouldFillSection(section, context) ? 'fill' : 'natural';
}

function isStretchBlock(block: CanvasBlock): boolean {
  return block.kind === 'textarea' || block.kind === 'editable-text';
}

function resolveDefaultCollapsed(
  section: ContainerRendererProps['section'],
  context: ContainerRendererProps['context'],
): boolean {
  if (shouldExpandSectionBySurface(section, context.layout.surface)) {
    return false;
  }

  if (shouldCollapseSectionBySurface(section, context.layout.surface)) {
    return true;
  }

  return section.defaultCollapsed ?? false;
}

function shouldExpandSectionBySurface(
  section: ContainerRendererProps['section'],
  surface: ContainerRendererProps['context']['layout']['surface'],
): boolean {
  const surfaces = section.metadata?.['defaultExpandedSurfaces'];
  return Array.isArray(surfaces) && surfaces.includes(surface);
}

function shouldCollapseSectionBySurface(
  section: ContainerRendererProps['section'],
  surface: ContainerRendererProps['context']['layout']['surface'],
): boolean {
  const surfaces = section.metadata?.['defaultCollapsedSurfaces'];
  return Array.isArray(surfaces) && surfaces.includes(surface);
}

function resolveLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  if (isI18nKey(label)) return t(label);
  return label;
}

function isI18nKey(label: string): boolean {
  return (
    label.startsWith('preset.') ||
    label.startsWith('action.') ||
    label.startsWith('scene.') ||
    label.startsWith('group.') ||
    label.startsWith('gallery.')
  );
}

function resolveSlotChildIds(
  node: ContainerRendererProps['context']['node'],
  allNodes: readonly CanvasNode[],
  childIds?: string[],
): string[] {
  if (childIds) return childIds;

  return uniqueStrings([
    ...getContainerChildIds(node),
    ...allNodes
      .filter((candidate) => candidate.id !== node.id && getNodeParentId(candidate) === node.id)
      .map((candidate) => candidate.id),
  ]);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueDisplayStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  ).sort((left, right) => left.localeCompare(right));
}

interface InlineEditableField {
  key: string;
  label: string;
  kind: 'input' | 'number' | 'textarea';
}

const INLINE_EDITABLE_FIELDS: Partial<Record<CanvasNode['type'], readonly InlineEditableField[]>> =
  {
    shot: [
      { key: 'shotNumber', label: 'preset.inlineField.shotNumber', kind: 'number' },
      { key: 'visualDescription', label: 'preset.inlineField.visualDescription', kind: 'textarea' },
      { key: 'characterAction', label: 'preset.inlineField.characterAction', kind: 'textarea' },
      { key: 'duration', label: 'preset.inlineField.duration', kind: 'number' },
    ],
    text: [{ key: 'content', label: 'preset.inlineField.text', kind: 'textarea' }],
    annotation: [{ key: 'content', label: 'preset.inlineField.note', kind: 'textarea' }],
    media: [
      { key: 'assetPath', label: 'preset.inlineField.asset', kind: 'input' },
      { key: 'mediaType', label: 'preset.inlineField.type', kind: 'input' },
    ],
    gallery: [{ key: 'characterName', label: 'preset.inlineField.character', kind: 'input' }],
  };

function resolveInlineEditableFields(node: CanvasNode): readonly InlineEditableField[] {
  const fields = INLINE_EDITABLE_FIELDS[node.type] ?? [];
  return fields.map((field) => ({
    ...field,
    label: resolveLabel(field.label) ?? field.label,
  }));
}

function readChildFieldValue(node: CanvasNode, key: string): string {
  const value = (node.data as Record<string, unknown>)[key];
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

interface ChildSlotLayout {
  className: string;
  style?: React.CSSProperties;
  cardVariant: NodeCardVariant;
  cardStyle?: React.CSSProperties;
  cardHeight: number;
  maxCardHeight: number;
}

function resolveChildSlotLayout(
  parentNode: CanvasNode,
  slot: ChildNodeSlot,
  layout: NodeContentLayoutContext,
  presentation: ChildSlotPresentation,
): ChildSlotLayout {
  const cardMetrics = resolveChildCardMetrics(layout, presentation);

  if (presentation === 'scene-shot-table') {
    return {
      className: 'flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden',
      cardVariant: 'summary-large',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (presentation === 'scene-shot-rail') {
    return {
      className: 'relative flex min-w-max flex-nowrap items-start gap-2',
      cardVariant: 'summary-large',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (presentation === 'group-summary') {
    const minColumnWidth = layout.width < 520 || layout.density === 'compact' ? 220 : 240;
    return {
      className:
        'grid min-h-0 min-w-0 auto-rows-fr gap-2 overflow-y-auto overflow-x-hidden px-2 pb-2',
      style: {
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`,
      },
      cardVariant: layout.width < 520 || layout.density === 'compact' ? 'row' : 'summary-large',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (presentation === 'gallery-grid') {
    const columns = resolveGalleryColumnCount(parentNode, layout);
    const minColumnWidth = layout.width < 520 || layout.density === 'compact' ? 128 : 168;
    return {
      className:
        'grid min-h-0 min-w-0 auto-rows-fr gap-2 overflow-y-auto overflow-x-hidden px-2 pb-2',
      style: {
        gridTemplateColumns:
          layout.width < 520 || layout.density === 'compact'
            ? `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`
            : `repeat(${columns}, minmax(${minColumnWidth}px, 1fr))`,
      },
      cardVariant: 'gallery',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (slot.layout === 'table') {
    return {
      className: 'grid min-h-0 min-w-0 gap-1.5 overflow-auto',
      style: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      },
      cardVariant: 'row',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  if (slot.layout === 'grid' || slot.layout === 'gallery') {
    if (layout.width < 520 || layout.density === 'compact') {
      return {
        className: 'flex min-h-0 min-w-0 flex-col gap-1.5 overflow-auto',
        cardVariant: 'row',
        cardStyle: createCardHeightStyle(cardMetrics),
        ...cardMetrics,
      };
    }

    return {
      className: 'grid min-h-0 min-w-0 gap-1.5 overflow-auto',
      style: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      },
      cardVariant: 'compact',
      cardStyle: createCardHeightStyle(cardMetrics),
      ...cardMetrics,
    };
  }

  return {
    className: 'flex min-h-0 min-w-0 flex-col gap-1 overflow-auto',
    cardVariant: 'summary',
    cardStyle: createCardHeightStyle(cardMetrics),
    ...cardMetrics,
  };
}

function resolveChildCardMetrics(
  layout: NodeContentLayoutContext,
  presentation: ChildSlotPresentation,
): { cardHeight: number; maxCardHeight: number } {
  const heightBudget = Math.max(
    0,
    layout.height - resolveContainerChromeHeight(layout, presentation),
  );
  const expanded = layout.surface === 'overlay' || layout.density === 'expanded';
  const minCardHeight =
    presentation === 'gallery-grid'
      ? 170
      : presentation === 'scene-shot-table'
        ? 180
        : presentation === 'scene-shot-rail'
          ? 150
          : 148;
  const maxCardHeight =
    presentation === 'gallery-grid'
      ? expanded
        ? 300
        : 240
      : presentation === 'scene-shot-table'
        ? expanded
          ? 360
          : 280
        : presentation === 'scene-shot-rail'
          ? expanded
            ? 240
            : 210
          : expanded
            ? 260
            : 220;
  const visibleRows =
    presentation === 'scene-shot-rail' || presentation === 'scene-shot-table'
      ? 1
      : expanded
        ? 2
        : 1;
  const targetHeight = Math.floor(heightBudget / visibleRows);
  return {
    cardHeight: clampNumber(targetHeight, minCardHeight, maxCardHeight),
    maxCardHeight,
  };
}

function resolveContainerChromeHeight(
  layout: NodeContentLayoutContext,
  presentation: ChildSlotPresentation,
): number {
  const base = layout.surface === 'overlay' ? 172 : 126;
  if (presentation === 'scene-shot-rail') {
    return base + 26;
  }
  if (presentation === 'scene-shot-table') {
    return base + 42;
  }
  return base;
}

function createCardHeightStyle(metrics: {
  cardHeight: number;
  maxCardHeight: number;
}): React.CSSProperties {
  return {
    height: `${metrics.cardHeight}px`,
    maxHeight: `${metrics.maxCardHeight}px`,
  };
}

function resolveGalleryColumnCount(
  parentNode: CanvasNode,
  layout: NodeContentLayoutContext,
): number {
  const dataCols = readNumber(parentNode.data, 'cols');
  const layoutColumns = parentNode.container?.layout?.columns;
  const preferredColumns = dataCols ?? layoutColumns ?? 3;
  const maxByWidth = Math.max(1, Math.floor(layout.width / 180));
  return clampNumber(preferredColumns, 1, Math.max(1, Math.min(6, maxByWidth)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function isSectionVisible(
  visibleWhen: string | undefined,
  context: ContainerRendererProps['context'],
): boolean {
  return (
    visibleWhen === undefined ||
    visibleWhen === 'always' ||
    (visibleWhen === 'selected' &&
      (context.isSelected || context.previewSurfaceKind === 'inline')) ||
    (visibleWhen === 'expanded' && context.isExpanded === true)
  );
}

function getSectionClassName(
  layout: string | undefined,
  fillMode: 'fill' | 'natural',
  contentChrome: NodeContentRenderContext['contentChrome'],
): string {
  const fillClass = fillMode === 'fill' ? ' flex-1 basis-0' : '';
  const spacingClass = contentChrome === 'full-bleed' ? 'gap-0 p-0' : 'gap-2 p-2';
  switch (layout) {
    case 'row':
      return `flex min-w-0 flex-row ${spacingClass} overflow-x-auto overflow-y-hidden`;
    case 'grid':
    case 'gallery':
      return `grid min-h-0 min-w-0 grid-cols-2 ${spacingClass} overflow-auto${fillClass}`;
    case 'table':
      return `grid min-h-0 min-w-0 ${contentChrome === 'full-bleed' ? 'gap-0 p-0' : 'gap-1 p-2'} overflow-auto${fillClass}`;
    default:
      return `flex min-h-0 min-w-0 flex-col ${spacingClass}${fillClass}`;
  }
}
