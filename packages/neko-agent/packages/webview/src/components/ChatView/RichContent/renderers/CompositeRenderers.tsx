import { useState } from 'react';
import type { RichContentProps, RichContentRendererEntry } from '../types';
import type {
  AssetGalleryRichData,
  ComparisonGridRichData,
  CompositeMediaDiagnostic,
  CompositeMediaType,
  ResolvedCompositeMedia,
  ResolvedCompositeSection,
  StoryboardTableRichData,
} from '@/presenters/composite-content-presenter';
import type { StoryboardSceneRow, StoryboardShotRow, StoryboardTextCue } from '@neko/shared';
import type { StoryboardShotPlanOverlay } from '@neko/shared';
import { AgentHostMessages } from '@/messages';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import { useTranslation } from '@/i18n/I18nContext';
import {
  projectStoryboardTableAssetBatch,
  projectStoryboardTableCanvasAuthoringHandoff,
  projectStoryboardTableCutTimelinePayload,
} from '@/presenters/storyboard-transfer-presenter';

function isStoryboardTableRichData(data: unknown): data is StoryboardTableRichData {
  return isCompositeData(data, 'storyboard-table');
}

function isComparisonGridRichData(data: unknown): data is ComparisonGridRichData {
  return isCompositeData(data, 'comparison');
}

function isAssetGalleryRichData(data: unknown): data is AssetGalleryRichData {
  return isCompositeData(data, 'gallery') || isCompositeData(data, 'report');
}

function StoryboardTableRendererComponent({
  data,
  className,
  conversationId,
}: RichContentProps<StoryboardTableRichData>) {
  const cutPayload = projectStoryboardTableCutTimelinePayload(data);
  const assetBatchPayload = projectStoryboardTableAssetBatch(data);
  const canvasAuthoringHandoff = projectStoryboardTableCanvasAuthoringHandoff(data);
  const plugins = data.plugins;
  const storyboardRows = data.storyboardTable ? projectSemanticStoryboardRows(data) : [];
  const rowCount = storyboardRows.length > 0 ? storyboardRows.length : data.sections.length;
  const { t } = useTranslation();

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader
        title={data.title ?? 'Storyboard'}
        count={
          storyboardRows.length > 0
            ? t('chat.storyboardTable.count.shots', { count: rowCount })
            : t('chat.storyboardTable.count.rows', { count: rowCount })
        }
        actions={
          plugins && (cutPayload || assetBatchPayload || canvasAuthoringHandoff) ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              {cutPayload && (
                <SendToMenu
                  payload={cutPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['cut']}
                  hidePrefixLabel
                />
              )}
              {canvasAuthoringHandoff && conversationId && (
                <SendToMenu
                  canvasAuthoringHandoff={canvasAuthoringHandoff}
                  conversationId={conversationId}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['canvas']}
                  hidePrefixLabel
                />
              )}
              {assetBatchPayload && (
                <SendToMenu
                  payload={assetBatchPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['explorer']}
                  hidePrefixLabel
                />
              )}
            </div>
          ) : null
        }
      />
      {storyboardRows.length > 0 ? (
        <SemanticStoryboardTable rows={storyboardRows} />
      ) : (
        <ProjectedStoryboardRows sections={data.sections} />
      )}
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

interface SemanticStoryboardRow {
  readonly id: string;
  readonly rowIndex: number;
  readonly scene: StoryboardSceneRow;
  readonly shot: StoryboardShotRow;
  readonly section?: ResolvedCompositeSection;
  readonly animationOverlay?: StoryboardShotPlanOverlay;
}

function projectSemanticStoryboardRows(
  data: StoryboardTableRichData,
): readonly SemanticStoryboardRow[] {
  const rows: SemanticStoryboardRow[] = [];
  const animationOverlays = createAnimationOverlayIndex(data);
  for (const scene of data.storyboardTable?.scenes ?? []) {
    for (const shot of scene.shots) {
      const rowIndex = rows.length;
      const shotId = shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`;
      rows.push({
        id: shotId,
        rowIndex,
        scene,
        shot,
        ...(data.sections[rowIndex] ? { section: data.sections[rowIndex] } : {}),
        ...(animationOverlays.get(shotId)
          ? { animationOverlay: animationOverlays.get(shotId) }
          : {}),
      });
    }
  }
  return rows;
}

function createAnimationOverlayIndex(
  data: StoryboardTableRichData,
): ReadonlyMap<string, StoryboardShotPlanOverlay> {
  const index = new Map<string, StoryboardShotPlanOverlay>();
  for (const overlay of data.storyboardPlanOverlays ?? []) {
    if (overlay.overlayType !== 'AnimationPlan') continue;
    for (const shotOverlay of overlay.shotOverlays) {
      index.set(shotOverlay.shotId, shotOverlay);
    }
  }
  return index;
}

function SemanticStoryboardTable({ rows }: { rows: readonly SemanticStoryboardRow[] }) {
  const { t } = useTranslation();
  const groups = groupStoryboardRowsByScene(rows);

  return (
    <div className="min-w-0 overflow-x-auto" data-agent-storyboard-canvas-scene-table="true">
      <table
        className="table-fixed border-collapse text-left text-[11px] text-[var(--agent-fg)]"
        style={{ width: 1160 }}
      >
        <colgroup>
          <col className="w-[76px]" />
          <col className="w-[132px]" />
          <col className="w-[216px]" />
          <col className="w-[248px]" />
          <col className="w-[72px]" />
          <col className="w-[176px]" />
          <col className="w-[128px]" />
          <col className="w-[112px]" />
        </colgroup>
        <thead className="bg-[var(--agent-elevated)] text-[10px] uppercase tracking-normal text-[var(--agent-fg-secondary)]">
          <tr className="bg-[var(--agent-elevated)] text-[10px] uppercase text-[var(--agent-fg-secondary)]">
            {STORYBOARD_TABLE_COLUMNS.map((columnKey) => (
              <TableHeader key={columnKey}>{t(columnKey)}</TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <SemanticStoryboardSceneGroup key={group.id} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SemanticStoryboardSceneGroup {
  readonly id: string;
  readonly scene: StoryboardSceneRow;
  readonly rows: readonly SemanticStoryboardRow[];
}

function groupStoryboardRowsByScene(
  rows: readonly SemanticStoryboardRow[],
): readonly SemanticStoryboardSceneGroup[] {
  const groups: Array<{
    id: string;
    scene: StoryboardSceneRow;
    rows: SemanticStoryboardRow[];
  }> = [];
  let current:
    | {
        id: string;
        scene: StoryboardSceneRow;
        rows: SemanticStoryboardRow[];
      }
    | undefined;

  for (const row of rows) {
    if (!current || current.scene !== row.scene) {
      current = {
        id: `${row.scene.sceneId || 'scene'}:${groups.length + 1}`,
        scene: row.scene,
        rows: [],
      };
      groups.push(current);
    }
    current.rows.push(row);
  }

  return groups;
}

function SemanticStoryboardSceneGroup({ group }: { group: SemanticStoryboardSceneGroup }) {
  return (
    <>
      <SemanticStoryboardSceneHeader scene={group.scene} shotCount={group.rows.length} />
      {group.rows.map((row) => (
        <SemanticStoryboardTableRow key={row.id} row={row} />
      ))}
    </>
  );
}

function SemanticStoryboardSceneHeader({
  scene,
  shotCount,
}: {
  scene: StoryboardSceneRow;
  shotCount: number;
}) {
  const { t } = useTranslation();
  const title = scene.sceneTitle || scene.sceneId;
  const meta = compactStrings([
    scene.sceneNumber
      ? t('chat.storyboardTable.scene.number', { number: scene.sceneNumber })
      : undefined,
    scene.sceneId,
    scene.location
      ? t('chat.storyboardTable.scene.location', { location: scene.location })
      : undefined,
    scene.timeOfDay
      ? t('chat.storyboardTable.scene.timeOfDay', { timeOfDay: scene.timeOfDay })
      : undefined,
    t('chat.storyboardTable.scene.shots', { count: shotCount }),
  ]);

  return (
    <tr className="bg-[color-mix(in_srgb,var(--agent-accent)_12%,var(--agent-elevated))]">
      <td
        colSpan={STORYBOARD_TABLE_COLUMN_COUNT}
        className="border-b border-[var(--agent-divider)] px-2 py-2"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-[12px] font-medium text-[var(--agent-fg)]">
            {title}
          </span>
          {meta.length > 0 && (
            <span className="break-words font-mono text-[10px] text-[var(--agent-fg-secondary)]">
              {meta.join(' / ')}
            </span>
          )}
        </div>
        {scene.summary && (
          <div className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--agent-fg-secondary)]">
            {scene.summary}
          </div>
        )}
      </td>
    </tr>
  );
}

function SemanticStoryboardTableRow({ row }: { row: SemanticStoryboardRow }) {
  const { t } = useTranslation();
  const { shot, section } = row;
  const dialogue = formatStoryboardTextAndVoice(shot, t);
  const supplementalAudio = formatSupplementalAudio(shot, t);
  const cueDisplay = compactStrings([dialogue, supplementalAudio]).join('\n');
  const imagePrompt = formatShotImagePrompt(shot);
  const videoPrompt = formatSceneVideoPrompt(shot, row.animationOverlay);
  const referenceMediaLabel = formatShotReferenceMediaLabel(shot, t);
  const state = resolveStoryboardSceneReviewState({
    shot,
    section,
    imagePrompt,
    videoPrompt,
    animationOverlay: row.animationOverlay,
    t,
  });

  return (
    <tr className="align-top text-[11px] text-[var(--agent-fg)] odd:bg-[color-mix(in_srgb,var(--agent-elevated)_40%,transparent)] hover:bg-[var(--agent-hover)]">
      <TableCell>
        <div className="font-mono text-[11px] font-medium">{formatShotNumber(shot.shotNumber)}</div>
        {shot.shotId && (
          <div className="mt-1 break-words font-mono text-[10px] text-[var(--agent-fg-secondary)]">
            {shot.shotId}
          </div>
        )}
      </TableCell>
      <TableCell>
        {section && section.media.length > 0 ? (
          <div className="grid gap-1">
            {section.media.map((media) => (
              <MediaPreview key={media.id} media={media} compact />
            ))}
          </div>
        ) : (
          <BoundedStoryboardTableText
            value={referenceMediaLabel}
            placeholder={t('chat.storyboardTable.placeholders.noReference')}
          />
        )}
        {section && <Diagnostics diagnostics={section.diagnostics} />}
      </TableCell>
      <TableCell>
        <BoundedStoryboardTableText
          value={imagePrompt}
          placeholder={t('chat.storyboardTable.placeholders.imagePromptSkipped')}
        />
      </TableCell>
      <TableCell>
        <BoundedStoryboardTableText
          value={videoPrompt}
          placeholder={t('chat.storyboardTable.placeholders.none')}
        />
      </TableCell>
      <TableCell>
        <BoundedStoryboardTableText value={formatDuration(shot.duration)} />
      </TableCell>
      <TableCell>
        <BoundedStoryboardTableText
          value={cueDisplay}
          placeholder={t('chat.storyboardTable.placeholders.noDialogue')}
        />
      </TableCell>
      <TableCell>
        <StoryboardReviewStateCell state={state} />
      </TableCell>
      <TableCell>
        <StoryboardReviewActionCell state={state} />
      </TableCell>
    </tr>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-[var(--agent-divider)] px-2 py-1.5 font-medium tracking-normal">
      {children}
    </th>
  );
}

function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border border-[var(--agent-divider)] px-2 py-2 ${className ?? ''}`}>
      {children}
    </td>
  );
}

const STORYBOARD_TABLE_COLUMNS = [
  'chat.storyboardTable.columns.shot',
  'chat.storyboardTable.columns.referenceMedia',
  'chat.storyboardTable.columns.imagePrompt',
  'chat.storyboardTable.columns.videoPrompt',
  'chat.storyboardTable.columns.duration',
  'chat.storyboardTable.columns.dialogue',
  'chat.storyboardTable.columns.state',
  'chat.storyboardTable.columns.action',
] as const;

const STORYBOARD_TABLE_COLUMN_COUNT = STORYBOARD_TABLE_COLUMNS.length;

interface StoryboardSceneReviewState {
  readonly label: string;
  readonly targetLabel: string;
  readonly actionLabel: string;
  readonly tone: 'neutral' | 'warning' | 'error';
}

function BoundedStoryboardTableText({
  value,
  placeholder = '-',
}: {
  readonly value: string | undefined;
  readonly placeholder?: string;
}) {
  return (
    <div
      className="line-clamp-2 min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.35] text-[var(--agent-fg)]"
      title={value || placeholder}
    >
      {value || <span className="text-[var(--agent-fg-secondary)]">{placeholder}</span>}
    </div>
  );
}

function StoryboardReviewStateCell({ state }: { state: StoryboardSceneReviewState }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={getStoryboardReviewStateClassName(state.tone)}>
        <span className="truncate">{state.label}</span>
      </span>
      <span className="truncate text-[10px] text-[var(--agent-fg-secondary)]">
        {state.targetLabel}
      </span>
    </div>
  );
}

function StoryboardReviewActionCell({ state }: { state: StoryboardSceneReviewState }) {
  return (
    <span
      className="inline-flex max-w-full rounded border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-2 py-1 text-[11px] leading-none text-[var(--agent-fg)]"
      title={state.actionLabel}
      data-agent-storyboard-action={state.actionLabel}
    >
      <span className="truncate">{state.actionLabel}</span>
    </span>
  );
}

function getStoryboardReviewStateClassName(tone: StoryboardSceneReviewState['tone']): string {
  const base = 'inline-flex max-w-full rounded border px-1.5 py-0.5 text-[11px] leading-none';
  if (tone === 'error') {
    return `${base} border-[var(--agent-error-fg)] bg-[color-mix(in_srgb,var(--agent-error-fg)_12%,transparent)] text-[var(--agent-error-fg)]`;
  }
  if (tone === 'warning') {
    return `${base} border-[var(--agent-warning-fg)] bg-[color-mix(in_srgb,var(--agent-warning-fg)_12%,transparent)] text-[var(--agent-warning-fg)]`;
  }
  return `${base} border-[var(--agent-divider)] bg-[var(--agent-elevated)] text-[var(--agent-fg-secondary)]`;
}

function ProjectedStoryboardRows({ sections }: { sections: readonly ResolvedCompositeSection[] }) {
  return (
    <div className="divide-y divide-[var(--agent-divider)]">
      {sections.map((section) => (
        <div
          key={section.id}
          className="grid gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(240px,440px)]"
        >
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-[var(--agent-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                {String(section.index + 1).padStart(2, '0')}
              </span>
              {section.heading && (
                <span className="truncate text-[12px] font-medium text-[var(--agent-fg)]">
                  {section.heading}
                </span>
              )}
            </div>
            {section.content && (
              <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--agent-fg)]">
                {section.content}
              </p>
            )}
            <Diagnostics diagnostics={section.diagnostics} />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-1">
            {section.media.map((media) => (
              <MediaPreview key={media.id} media={media} compact />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatShotImagePrompt(shot: StoryboardShotRow): string | undefined {
  return shot.imagePrompt?.trim() || undefined;
}

function formatSceneVideoPrompt(
  shot: StoryboardShotRow,
  animationOverlay: StoryboardShotPlanOverlay | undefined,
): string | undefined {
  return (
    shot.videoPrompt?.trim() || animationOverlay?.videoPromptIntent?.positive?.trim() || undefined
  );
}

function formatShotReferenceMediaLabel(
  shot: StoryboardShotRow,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | undefined {
  const refs = [...(shot.sourceMediaRefs ?? []), ...(shot.mediaRefs ?? [])];
  if (refs.length === 0) return undefined;
  if (refs.length === 1) {
    const ref = refs[0];
    return ref?.label ?? ref?.refId ?? t('chat.storyboardTable.placeholders.referenceBound');
  }
  return t('chat.storyboardTable.placeholders.referenceCount', { count: refs.length });
}

function resolveStoryboardSceneReviewState(input: {
  readonly shot: StoryboardShotRow;
  readonly section?: ResolvedCompositeSection;
  readonly imagePrompt: string | undefined;
  readonly videoPrompt: string | undefined;
  readonly animationOverlay: StoryboardShotPlanOverlay | undefined;
  readonly t: (key: string) => string;
}): StoryboardSceneReviewState {
  if (input.section?.diagnostics.some((diagnostic) => diagnostic.code !== undefined)) {
    return {
      label: input.t('chat.storyboardTable.state.fixReference'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.referenceMedia'),
      actionLabel: input.t('chat.storyboardTable.actions.fixReference'),
      tone: 'error',
    };
  }

  if ((input.shot.generatedMediaRefs ?? []).length > 0) {
    return {
      label: input.t('chat.storyboardTable.state.reviewResult'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.resultReview'),
      actionLabel: input.t('chat.storyboardTable.actions.reviewResult'),
      tone: 'neutral',
    };
  }

  if (!input.videoPrompt) {
    return {
      label: input.t('chat.storyboardTable.state.optimizeVideoPrompt'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.videoPrompt'),
      actionLabel: input.t('chat.storyboardTable.actions.optimizeVideoPrompt'),
      tone: 'warning',
    };
  }

  const hasReferenceMedia = hasStoryboardReferenceMedia(input.shot, input.section);
  if (input.animationOverlay?.requiresImagePrep) {
    return {
      label: input.t('chat.storyboardTable.state.processReference'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.referenceMedia'),
      actionLabel: input.t('chat.storyboardTable.actions.processReference'),
      tone: 'warning',
    };
  }

  if (!hasReferenceMedia && input.shot.imageStrategy === 'generate-new' && !input.imagePrompt) {
    return {
      label: input.t('chat.storyboardTable.state.optimizeImagePrompt'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.imagePrompt'),
      actionLabel: input.t('chat.storyboardTable.actions.optimizeImagePrompt'),
      tone: 'warning',
    };
  }

  if (!hasReferenceMedia && input.imagePrompt) {
    return {
      label: input.t('chat.storyboardTable.state.generateReferenceImage'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.imagePrompt'),
      actionLabel: input.t('chat.storyboardTable.actions.generateImage'),
      tone: 'neutral',
    };
  }

  if (hasReferenceMedia && !input.imagePrompt) {
    return {
      label: input.t('chat.storyboardTable.state.imagePromptSkipped'),
      targetLabel: input.t('chat.storyboardTable.stateTarget.videoPrompt'),
      actionLabel: input.t('chat.storyboardTable.actions.generateVideo'),
      tone: 'neutral',
    };
  }

  return {
    label: input.t('chat.storyboardTable.state.readyForVideo'),
    targetLabel: input.t('chat.storyboardTable.stateTarget.videoPrompt'),
    actionLabel: input.t('chat.storyboardTable.actions.generateVideo'),
    tone: 'neutral',
  };
}

function hasStoryboardReferenceMedia(
  shot: StoryboardShotRow,
  section: ResolvedCompositeSection | undefined,
): boolean {
  return (
    (shot.sourceMediaRefs ?? []).length > 0 ||
    (shot.mediaRefs ?? []).length > 0 ||
    (section?.media.length ?? 0) > 0
  );
}

function formatShotNumber(shotNumber: number): string {
  return `#${String(shotNumber).padStart(2, '0')}`;
}

function formatDuration(duration: number): string {
  return `${Number.isFinite(duration) ? duration : 0}s`;
}

function formatStoryboardTextAndVoice(
  shot: StoryboardShotRow,
  t: (key: string) => string,
): string | undefined {
  const textCueLines = (shot.textCues ?? []).map((cue) => formatStoryboardTextCue(cue, t));
  const voiceCueLines = (shot.voiceCues ?? [])
    .filter((cue) => !hasMatchingTextCue(shot.textCues, cue.kind, cue.text))
    .map((cue) => {
      const label =
        cue.kind === 'dialogue'
          ? t('chat.storyboardTable.labels.dialogue')
          : t('chat.storyboardTable.labels.voiceOver');
      const speaker = formatCueSpeaker(
        cue.speakerName,
        cue.speakerCharacterId,
        cue.speakerEntityRef?.entityId,
      );
      return `${label}${speaker ? ` / ${speaker}` : ''}: ${cue.text}`;
    });
  return compactStrings([...textCueLines, ...voiceCueLines]).join('\n') || undefined;
}

function hasMatchingTextCue(
  textCues: StoryboardShotRow['textCues'],
  voiceKind: 'dialogue' | 'voiceOver',
  text: string,
): boolean {
  const expectedKind = voiceKind === 'dialogue' ? 'dialogue' : 'narration';
  const normalizedText = normalizeCueDisplayText(text);
  return (textCues ?? []).some(
    (cue) => cue.kind === expectedKind && normalizeCueDisplayText(cue.text) === normalizedText,
  );
}

function formatStoryboardTextCue(cue: StoryboardTextCue, t: (key: string) => string): string {
  const label = t(`chat.storyboardTable.textCueKinds.${cue.kind}`);
  const speaker = formatCueSpeaker(
    cue.speakerName,
    cue.speakerCharacterId,
    cue.speakerEntityRef?.entityId,
  );
  const suffix = compactStrings([cue.emotion, cue.delivery]).join(' / ');
  return compactStrings([
    `${label}${speaker ? ` / ${speaker}` : ''}: ${cue.text}`,
    suffix ? `(${suffix})` : undefined,
  ]).join(' ');
}

function formatSupplementalAudio(
  shot: StoryboardShotRow,
  t: (key: string) => string,
): string | undefined {
  const hasDialogueCue =
    (shot.textCues ?? []).some((cue) => cue.kind === 'dialogue') ||
    (shot.voiceCues ?? []).some((cue) => cue.kind === 'dialogue');
  const hasVoiceOverCue =
    (shot.textCues ?? []).some((cue) => cue.kind === 'narration') ||
    (shot.voiceCues ?? []).some((cue) => cue.kind === 'voiceOver');
  const hasSoundCue = (shot.textCues ?? []).some((cue) => cue.kind === 'sfx');
  return compactStrings([
    shot.dialogue && !hasDialogueCue
      ? `${t('chat.storyboardTable.labels.dialogue')}: ${shot.dialogue}`
      : undefined,
    shot.voiceOver && !hasVoiceOverCue
      ? `${t('chat.storyboardTable.labels.voiceOver')}: ${shot.voiceOver}`
      : undefined,
    shot.soundCue && !hasSoundCue
      ? `${t('chat.storyboardTable.labels.soundCue')}: ${shot.soundCue}`
      : undefined,
  ]).join('\n');
}

function formatCueSpeaker(
  speakerName: string | undefined,
  speakerCharacterId: string | undefined,
  speakerEntityId: string | undefined,
): string | undefined {
  if (speakerName && speakerEntityId && speakerName !== speakerEntityId) {
    return `${speakerName} [${speakerEntityId}]`;
  }
  if (speakerName && speakerCharacterId && speakerName !== speakerCharacterId) {
    return `${speakerName} [${speakerCharacterId}]`;
  }
  return speakerName ?? speakerEntityId ?? speakerCharacterId;
}

function normalizeCueDisplayText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function compactStrings(values: readonly (string | undefined | null)[] | undefined): string[] {
  return (values ?? []).filter((value): value is string => Boolean(value && value.trim()));
}

function ComparisonGridRendererComponent({
  data,
  className,
}: RichContentProps<ComparisonGridRichData>) {
  const cells = data.sections.flatMap((section) =>
    section.media.map((media) => ({ section, media })),
  );

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader title={data.title ?? 'Comparison'} count={`${cells.length} variants`} />
      <div className="grid gap-2 p-2 sm:grid-cols-2">
        {cells.map(({ section, media }) => (
          <div
            key={`${section.id}:${media.id}`}
            className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5"
          >
            <MediaPreview media={media} />
            <div className="mt-1 min-w-0">
              <div className="truncate text-[11px] font-medium text-[var(--agent-fg)]">
                {media.caption ??
                  section.heading ??
                  media.label ??
                  `Variant ${media.assetIndex + 1}`}
              </div>
              {section.content && (
                <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-[var(--agent-fg-secondary)]">
                  {section.content}
                </p>
              )}
              <MediaTransferActions media={media} plugins={data.plugins} />
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function AssetGalleryRendererComponent({
  data,
  className,
}: RichContentProps<AssetGalleryRichData>) {
  const assets = data.sections.flatMap((section) =>
    section.media.map((media) => ({ section, media })),
  );

  return (
    <div className={`agent-inline-card overflow-hidden ${className ?? ''}`}>
      <CompositeHeader title={data.title ?? 'Assets'} count={`${assets.length} assets`} />
      <div className="grid gap-2 p-2 sm:grid-cols-3">
        {assets.map(({ section, media }) => (
          <div
            key={`${section.id}:${media.id}`}
            className="min-w-0 rounded border border-[var(--agent-divider)] bg-[var(--agent-elevated)] p-1.5"
          >
            <MediaPreview media={media} />
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--agent-fg-secondary)]">
                {media.caption ?? section.heading ?? media.label ?? media.assetId ?? 'Asset'}
              </span>
              {media.localPath && (
                <button
                  type="button"
                  className="rounded border border-[var(--agent-input-border)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                  onClick={() => AgentHostMessages.openFile(media.localPath!)}
                >
                  Open
                </button>
              )}
              <MediaTransferActions media={media} plugins={data.plugins} />
            </div>
          </div>
        ))}
      </div>
      <Diagnostics diagnostics={data.diagnostics} aggregate />
    </div>
  );
}

function CompositeHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--agent-divider)] bg-[var(--agent-elevated)] px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--agent-fg)]">
        {title}
      </span>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap justify-end">{actions}</div>
      ) : null}
      <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">{count}</span>
    </div>
  );
}

function MediaPreview({
  media,
  compact = false,
}: {
  media: ResolvedCompositeMedia;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = media.caption ?? media.label ?? media.assetId ?? 'Media';
  const imagePreviewFrameClassName = compact
    ? 'inline-flex max-h-[220px] max-w-[170px]'
    : 'flex h-[220px] max-h-[220px] w-full';
  const previewImageClassName = compact
    ? 'h-auto max-h-[220px] w-auto max-w-full object-contain'
    : 'h-full w-full object-contain';
  const fallbackPreviewFrameClassName = compact
    ? 'h-[160px] max-h-[160px]'
    : 'h-[220px] max-h-[220px]';
  const roleLabel = formatMediaRole(media.role);
  const hasRenderableSource = media.src.trim().length > 0;
  const canOpen = canOpenMedia(media);

  if (media.type === 'image') {
    return (
      <div className="min-w-0">
        <button
          type="button"
          className={`min-w-0 items-center justify-center overflow-hidden rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] disabled:cursor-default ${imagePreviewFrameClassName}`}
          onClick={() => openMedia(media)}
          disabled={!canOpen}
          title={label}
        >
          {hasRenderableSource && !imageFailed ? (
            <img
              src={media.src}
              alt={label}
              className={previewImageClassName}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MediaPreviewFallback mediaType={media.type} label={label} compact={compact} />
          )}
        </button>
        {roleLabel && (
          <div className="mt-0.5 truncate text-[9px] leading-tight text-[var(--agent-fg-secondary)]">
            {roleLabel}
          </div>
        )}
      </div>
    );
  }

  if (media.type === 'video') {
    if (!hasRenderableSource) {
      return (
        <MediaPreviewFallbackFrame
          media={media}
          label={label}
          compact={compact}
          previewHeightClassName={fallbackPreviewFrameClassName}
        />
      );
    }
    return (
      <video
        src={media.src}
        controls
        preload="metadata"
        className={`w-full rounded bg-black object-contain ${fallbackPreviewFrameClassName}`}
        title={label}
      />
    );
  }

  if (media.type === 'audio') {
    if (!hasRenderableSource) {
      return (
        <MediaPreviewFallbackFrame
          media={media}
          label={label}
          compact={compact}
          previewHeightClassName="min-h-[42px]"
        />
      );
    }
    return <audio src={media.src} controls className="w-full" title={label} />;
  }

  if (media.type === 'model') {
    return (
      <button
        type="button"
        className="flex w-full items-center justify-center rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] px-2 py-4 text-[10px] text-[var(--agent-fg-secondary)]"
        onClick={() => openMedia(media)}
        title={label}
      >
        3D Model - {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-center rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] px-2 py-4 text-[10px] text-[var(--agent-fg-secondary)]"
      onClick={() => openMedia(media)}
      title={label}
    >
      {label}
    </button>
  );
}

function MediaPreviewFallbackFrame({
  media,
  label,
  compact,
  previewHeightClassName,
}: {
  media: ResolvedCompositeMedia;
  label: string;
  compact: boolean;
  previewHeightClassName: string;
}) {
  const canOpen = canOpenMedia(media);
  return (
    <button
      type="button"
      className={`flex w-full min-w-0 overflow-hidden rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] disabled:cursor-default ${previewHeightClassName}`}
      onClick={() => openMedia(media)}
      disabled={!canOpen}
      title={label}
    >
      <MediaPreviewFallback mediaType={media.type} label={label} compact={compact} />
    </button>
  );
}

function MediaPreviewFallback({
  mediaType,
  label,
  compact,
}: {
  mediaType: CompositeMediaType;
  label: string;
  compact: boolean;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 px-2 text-center text-[var(--agent-fg-secondary)]">
      <span className="font-mono text-[9px] uppercase tracking-normal">
        {formatMediaTypeLabel(mediaType)}
      </span>
      <span
        className={`${compact ? 'line-clamp-2 text-[9px]' : 'line-clamp-3 text-[10px]'} max-w-full break-all font-medium leading-snug text-[var(--agent-fg)]`}
      >
        {label}
      </span>
      <span className="text-[9px] leading-tight">Preview unavailable</span>
    </div>
  );
}

function formatMediaTypeLabel(mediaType: CompositeMediaType): string {
  switch (mediaType) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'model':
      return 'Model';
    default:
      return 'Media';
  }
}

function formatMediaRole(role: string | undefined): string | undefined {
  switch (role) {
    case 'original':
      return 'Original';
    case 'colorized':
      return 'Color';
    case 'generated':
      return 'Generated';
    default:
      return role;
  }
}

function MediaTransferActions({
  media,
  plugins,
}: {
  media: ResolvedCompositeMedia;
  plugins?: AssetGalleryRichData['plugins'];
}) {
  if (!plugins || !media.localPath) return null;
  const mediaType = toPluginTransferMediaType(media.type);
  if (!mediaType) return null;

  return (
    <SendToMenu
      assetPath={media.localPath}
      mediaType={mediaType}
      plugins={plugins}
      allowedTargets={mediaType === 'model' ? ['model', 'explorer'] : undefined}
    />
  );
}

function toPluginTransferMediaType(
  mediaType: CompositeMediaType,
): 'image' | 'video' | 'audio' | 'model' | null {
  if (
    mediaType === 'image' ||
    mediaType === 'video' ||
    mediaType === 'audio' ||
    mediaType === 'model'
  ) {
    return mediaType;
  }
  return null;
}

function Diagnostics({
  diagnostics,
  aggregate = false,
}: {
  diagnostics: readonly CompositeMediaDiagnostic[];
  aggregate?: boolean;
}) {
  if (diagnostics.length === 0) return null;

  const visible = aggregate ? dedupeDiagnostics(diagnostics) : diagnostics;
  if (visible.length === 0) return null;

  return (
    <div
      className={`${aggregate ? 'border-t border-[var(--agent-divider)] px-2 py-1.5' : 'mt-1'} space-y-1`}
    >
      {visible.map((diagnostic) => (
        <div
          key={`${diagnostic.code}:${diagnostic.toolCallId}:${diagnostic.assetIndex ?? 'x'}:${diagnostic.assetId ?? ''}`}
          className="rounded bg-[color-mix(in_srgb,var(--agent-warning-fg)_10%,transparent)] px-1.5 py-1 text-[10px] text-[var(--agent-warning-fg)]"
        >
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}

function openMedia(media: ResolvedCompositeMedia): void {
  if (media.localPath) {
    AgentHostMessages.openFile(media.localPath);
    return;
  }
  if (media.src) {
    AgentHostMessages.openUrl(media.src);
  }
}

function canOpenMedia(media: ResolvedCompositeMedia): boolean {
  return Boolean(media.localPath || media.src);
}

function dedupeDiagnostics(
  diagnostics: readonly CompositeMediaDiagnostic[],
): readonly CompositeMediaDiagnostic[] {
  const seen = new Set<string>();
  const result: CompositeMediaDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.toolCallId}:${diagnostic.assetIndex ?? ''}:${diagnostic.assetId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function isCompositeData<T extends string>(data: unknown, template: T): data is { template: T } {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return record['template'] === template && Array.isArray(record['sections']);
}

export const storyboardTableRendererEntry: RichContentRendererEntry<StoryboardTableRichData> = {
  kind: 'storyboard-table',
  validate: isStoryboardTableRichData,
  component: StoryboardTableRendererComponent,
};

export const comparisonGridRendererEntry: RichContentRendererEntry<ComparisonGridRichData> = {
  kind: 'comparison-grid',
  validate: isComparisonGridRichData,
  component: ComparisonGridRendererComponent,
};

export const assetGalleryRendererEntry: RichContentRendererEntry<AssetGalleryRichData> = {
  kind: 'asset-gallery',
  validate: isAssetGalleryRichData,
  component: AssetGalleryRendererComponent,
};
