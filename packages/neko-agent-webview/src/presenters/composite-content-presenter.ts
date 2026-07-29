import type {
  CompositeBlockData,
  CompositeSection,
  ContentBlock,
  MediaRef,
  ToolCall,
} from '@neko-agent/types';
import type {
  StoryboardTable,
  StoryboardPlanOverlay,
  StoryboardMediaRef,
  StoryboardValidationDiagnostic,
  DocumentArchiveResourceRef,
  EntityMemoryContribution,
  ToolResultAttachment,
} from '@neko/shared';
import {
  isPublicGeneratedAssetResultUri,
  isEntityMemoryContribution,
  normalizeStoryboardPlanOverlay,
  normalizeCanonicalStoryboardTable,
  parseDocumentArchiveResourceRef,
} from '@neko/shared';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

export type CompositeRichContentKind = 'storyboard-table' | 'comparison-grid' | 'asset-gallery';

export type CompositeMediaType = 'image' | 'video' | 'audio' | 'model' | 'unknown';

export type CompositeMediaDiagnosticCode =
  'missing-tool-result' | 'missing-asset' | 'missing-uri' | 'ambiguous-media-alias';

export interface CompositeMediaDiagnostic {
  readonly code: CompositeMediaDiagnosticCode;
  readonly toolCallId: string;
  readonly assetIndex?: number;
  readonly assetId?: string;
  readonly message: string;
}

export type CompositeStoryboardDiagnostic = StoryboardValidationDiagnostic;

export interface ResolvedCompositeMedia {
  readonly id: string;
  readonly toolCallId: string;
  readonly assetIndex: number;
  readonly type: CompositeMediaType;
  readonly src: string;
  readonly renderUri?: string;
  readonly assetId?: string;
  readonly stableUri?: string;
  readonly localPath?: string;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly mimeType?: string;
  readonly caption?: string;
  readonly role?: string;
  readonly label?: string;
}

export interface ResolvedCompositeSection {
  readonly id: string;
  readonly index: number;
  readonly heading?: string;
  readonly content?: string;
  readonly layout?: CompositeSection['layout'];
  readonly media: readonly ResolvedCompositeMedia[];
  readonly diagnostics: readonly CompositeMediaDiagnostic[];
}

export interface CompositeRichContentData {
  readonly template: CompositeBlockData['template'];
  readonly title?: string;
  readonly plugins?: PluginsAvailable;
  readonly storyboardTable?: StoryboardTable;
  readonly storyboardPlanOverlays?: readonly StoryboardPlanOverlay[];
  readonly entityMemoryContribution?: EntityMemoryContribution;
  readonly storyboardDiagnostics?: readonly CompositeStoryboardDiagnostic[];
  readonly sections: readonly ResolvedCompositeSection[];
  readonly diagnostics: readonly CompositeMediaDiagnostic[];
}

export type StoryboardTableRichData = CompositeRichContentData & {
  readonly template: 'storyboard-table';
};

export type ComparisonGridRichData = CompositeRichContentData & {
  readonly template: 'comparison';
};

export type AssetGalleryRichData = CompositeRichContentData & {
  readonly template: 'gallery' | 'report';
};

export type CompositeRichContentProjection =
  | {
      readonly kind: 'storyboard-table';
      readonly data: StoryboardTableRichData;
    }
  | {
      readonly kind: 'comparison-grid';
      readonly data: ComparisonGridRichData;
    }
  | {
      readonly kind: 'asset-gallery';
      readonly data: AssetGalleryRichData;
    };

export interface ProjectCompositeBlockRichContentInput {
  readonly composite: CompositeBlockData;
  readonly siblingBlocks?: readonly ContentBlock[];
  readonly toolCalls?: readonly ToolCall[];
  readonly plugins?: PluginsAvailable;
}

interface MediaCandidate {
  readonly assetIndex: number;
  readonly type: CompositeMediaType;
  readonly src?: string;
  readonly renderUri?: string;
  readonly assetId?: string;
  readonly stableUri?: string;
  readonly localPath?: string;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly mimeType?: string;
  readonly label?: string;
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly pageNumber?: number;
}

interface InferredStoryboardImageRef {
  readonly toolCallId: string;
  readonly assetIndex: number;
  readonly label?: string;
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly batchKey: string;
  readonly mimeType?: string;
  readonly pageNumber?: number;
  readonly resourceRef?: DocumentArchiveResourceRef;
}

interface StoryboardImageAliasIndex {
  readonly refs: readonly InferredStoryboardImageRef[];
  readonly batches: ReadonlyMap<string, readonly InferredStoryboardImageRef[]>;
  readonly aliases: ReadonlyMap<string, readonly InferredStoryboardImageRef[]>;
  readonly scopedAliases: ReadonlyMap<string, readonly InferredStoryboardImageRef[]>;
  readonly sourceLocators: ReadonlyMap<string, readonly InferredStoryboardImageRef[]>;
}

const MAX_COMPOSITE_MEDIA_DIAGNOSTICS = 8;

export function projectCompositeBlockRichContent(
  input: ProjectCompositeBlockRichContentInput,
): CompositeRichContentProjection {
  const toolCalls = collectToolCalls(input.siblingBlocks, input.toolCalls);
  const diagnostics: CompositeMediaDiagnostic[] = [];
  const normalizedStoryboard = normalizeCompositeStoryboardTable(input.composite.storyboardTable);
  const storyboardTable = maybeAttachInferredStoryboardMediaRefs(
    normalizedStoryboard,
    toolCalls,
    input.composite.sections,
    diagnostics,
  );
  const sectionInputs = maybeAlignStoryboardSectionMediaRefs(
    input.composite.sections,
    storyboardTable,
    toolCalls,
  );
  const projectedSections = sectionInputs.map((section, sectionIndex) =>
    projectCompositeSection({
      section,
      sectionIndex,
      toolCalls,
      diagnostics,
    }),
  );
  const sections = maybeBackfillStoryboardSectionMedia(
    projectedSections,
    storyboardTable,
    toolCalls,
    diagnostics,
  );

  const base = {
    ...(input.composite.title ? { title: input.composite.title } : {}),
    ...(input.plugins ? { plugins: input.plugins } : {}),
    ...(storyboardTable ? { storyboardTable } : {}),
    ...resolveStoryboardPlanOverlays(input.composite, storyboardTable),
    ...resolveEntityMemoryContribution(input.composite),
    ...mergeStoryboardDiagnostics(input.composite.storyboardDiagnostics, diagnostics),
    sections,
    diagnostics,
  };

  switch (input.composite.template) {
    case 'storyboard-table':
      return { kind: 'storyboard-table', data: { ...base, template: 'storyboard-table' } };
    case 'comparison':
      return { kind: 'comparison-grid', data: { ...base, template: 'comparison' } };
    case 'gallery':
    case 'report':
      return { kind: 'asset-gallery', data: { ...base, template: input.composite.template } };
  }
}

function resolveStoryboardPlanOverlays(
  composite: CompositeBlockData,
  storyboardTable: StoryboardTable | undefined,
): { readonly storyboardPlanOverlays?: readonly StoryboardPlanOverlay[] } {
  if (!composite.storyboardPlanOverlays || composite.storyboardPlanOverlays.length === 0) {
    return {};
  }
  const overlays = composite.storyboardPlanOverlays.flatMap((overlay) => {
    const normalized = normalizeStoryboardPlanOverlay(overlay, {
      sourceStoryboard: storyboardTable,
    });
    return normalized.overlay ? [normalized.overlay] : [];
  });
  return overlays.length > 0 ? { storyboardPlanOverlays: overlays } : {};
}

function resolveEntityMemoryContribution(composite: CompositeBlockData): {
  readonly entityMemoryContribution?: EntityMemoryContribution;
} {
  const candidates: readonly unknown[] = [
    composite.extensions?.['neko.entityMemoryContribution'],
    composite.extensions?.['neko.entityMemoryContributionPayload'],
    ...composite.sections.flatMap((section) => [
      section.extensions?.['neko.entityMemoryContribution'],
      section.extensions?.['neko.entityMemoryContributionPayload'],
    ]),
  ];
  const contribution = candidates.find((candidate): candidate is EntityMemoryContribution =>
    isEntityMemoryContribution(candidate),
  );
  return contribution ? { entityMemoryContribution: contribution } : {};
}

function normalizeCompositeStoryboardTable(
  storyboardTable: StoryboardTable | undefined,
): StoryboardTable | undefined {
  if (!storyboardTable) return undefined;
  return normalizeCanonicalStoryboardTable({ value: storyboardTable }).table;
}

function mergeStoryboardDiagnostics(
  existing: readonly CompositeStoryboardDiagnostic[] | undefined,
  mediaDiagnostics: readonly CompositeMediaDiagnostic[],
): { readonly storyboardDiagnostics?: readonly CompositeStoryboardDiagnostic[] } {
  const projected = mediaDiagnostics.flatMap(projectMediaDiagnosticToStoryboardDiagnostic);
  const merged = dedupeStoryboardDiagnostics([...(existing ?? []), ...projected]);
  return merged.length > 0 ? { storyboardDiagnostics: merged } : {};
}

function dedupeStoryboardDiagnostics(
  diagnostics: readonly CompositeStoryboardDiagnostic[],
): readonly CompositeStoryboardDiagnostic[] {
  const seen = new Set<string>();
  const result: CompositeStoryboardDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.path.join('.'),
      JSON.stringify(diagnostic.actual ?? ''),
      JSON.stringify(diagnostic.details ?? {}),
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function projectMediaDiagnosticToStoryboardDiagnostic(
  diagnostic: CompositeMediaDiagnostic,
): readonly CompositeStoryboardDiagnostic[] {
  switch (diagnostic.code) {
    case 'ambiguous-media-alias':
      return [
        {
          severity: 'error',
          code: 'ambiguous-media-alias',
          path: ['sourceMediaRefs'],
          message: diagnostic.message,
          details: {
            toolCallId: diagnostic.toolCallId,
            ...(diagnostic.assetIndex !== undefined ? { assetIndex: diagnostic.assetIndex } : {}),
          },
        },
      ];
    case 'missing-tool-result':
      return [
        {
          severity: 'error',
          code: 'unresolved-tool-result',
          path: ['sourceMediaRefs'],
          message: diagnostic.message,
          actual: diagnostic.toolCallId,
          details: {
            toolCallId: diagnostic.toolCallId,
            ...(diagnostic.assetIndex !== undefined ? { assetIndex: diagnostic.assetIndex } : {}),
          },
        },
      ];
    default:
      return [];
  }
}

function maybeAttachInferredStoryboardMediaRefs(
  storyboardTable: StoryboardTable | undefined,
  toolCalls: ReadonlyMap<string, ToolCall>,
  sections: readonly CompositeSection[],
  diagnostics: CompositeMediaDiagnostic[],
): StoryboardTable | undefined {
  if (!storyboardTable) return undefined;
  const imageIndex = createStoryboardImageAliasIndex(toolCalls);
  if (imageIndex.refs.length === 0) return storyboardTable;

  let rowIndex = 0;
  let changed = false;
  const scenes = storyboardTable.scenes.map((scene) => {
    let sceneChanged = false;
    const shots = scene.shots.map((shot) => {
      const inferredRef = selectInferredStoryboardImageRefForShot({
        scene,
        shot,
        section: sections[rowIndex],
        rowIndex,
        imageIndex,
        diagnostics,
      });
      rowIndex += 1;
      if (!inferredRef || hasResolvedStoryboardShotImageReference(shot, toolCalls)) {
        return shot;
      }

      changed = true;
      sceneChanged = true;
      return {
        ...shot,
        sourceMediaRefs: [projectInferredImageRefToStoryboardMediaRef(inferredRef)],
      };
    });
    return sceneChanged ? { ...scene, shots } : scene;
  });

  return changed ? { ...storyboardTable, scenes } : storyboardTable;
}

function selectInferredStoryboardImageRefForShot(input: {
  readonly scene: StoryboardTable['scenes'][number];
  readonly shot: StoryboardTable['scenes'][number]['shots'][number];
  readonly section?: CompositeSection;
  readonly rowIndex: number;
  readonly imageIndex: StoryboardImageAliasIndex;
  readonly diagnostics: CompositeMediaDiagnostic[];
}): InferredStoryboardImageRef | undefined {
  const explicit = selectExplicitStoryboardImageRef(input.shot, input.imageIndex);
  if (explicit) return explicit;
  const hasExplicitRefs =
    (input.shot.sourceMediaRefs ?? []).length > 0 || (input.shot.mediaRefs ?? []).length > 0;

  const pageNumber = inferStoryboardShotPageNumber(input.scene, input.shot, input.section);
  if (pageNumber !== undefined) {
    const aliasMatches = selectUniqueAliasRef(input.imageIndex, `page_${pageNumber}`);
    if (aliasMatches.status === 'unique') return aliasMatches.ref;
    if (aliasMatches.status === 'ambiguous') {
      pushDiagnostic(input.diagnostics, {
        code: 'ambiguous-media-alias',
        toolCallId: 'storyboard-alias',
        message: `Storyboard alias page_${pageNumber} resolves to multiple image batches.`,
      });
      return undefined;
    }
  }

  if (hasExplicitRefs) return undefined;
  const batchRefs = selectSingleEligibleImageBatch(input.imageIndex);
  return batchRefs?.[input.rowIndex];
}

function hasResolvedStoryboardShotImageReference(
  shot: StoryboardTable['scenes'][number]['shots'][number],
  toolCalls: ReadonlyMap<string, ToolCall>,
): boolean {
  if (shot.referenceImagePath) return true;
  if (collectExplicitStoryboardDocumentMediaRefs(shot).length > 0) return true;
  return collectExplicitStoryboardMediaRefs(shot).some((mediaRef) => {
    const resolved = resolveCompositeMediaRef(mediaRef, toolCalls);
    return 'media' in resolved;
  });
}

function selectExplicitStoryboardImageRef(
  shot: StoryboardTable['scenes'][number]['shots'][number],
  imageIndex: StoryboardImageAliasIndex,
): InferredStoryboardImageRef | undefined {
  for (const mediaRef of [...(shot.sourceMediaRefs ?? []), ...(shot.mediaRefs ?? [])]) {
    const locator = mediaRef.locator;
    if (locator.type === 'tool-result') {
      const exact = imageIndex.refs.find(
        (ref) => ref.toolCallId === locator.toolCallId && ref.assetIndex === locator.assetIndex,
      );
      if (exact) return exact;
      if (isRepairableStoryboardToolResultAlias(locator.toolCallId)) {
        const batchRefs = selectSingleEligibleImageBatch(imageIndex);
        const batchRef = batchRefs?.[locator.assetIndex];
        if (batchRef) return batchRef;
      }
      continue;
    }

    if (locator.type === 'asset' && locator.uri) {
      const stableMatch = imageIndex.refs.find((ref) => ref.entryPath === locator.uri);
      if (stableMatch) return stableMatch;
    }

    const alias =
      normalizeStoryboardAlias(mediaRef.label) ?? normalizeStoryboardAlias(mediaRef.refId);
    const aliasMatch = alias
      ? selectUniqueAliasRef(imageIndex, alias)
      : { status: 'none' as const };
    if (aliasMatch.status === 'unique') return aliasMatch.ref;
  }
  return undefined;
}

function projectInferredImageRefToStoryboardMediaRef(
  imageRef: InferredStoryboardImageRef,
): StoryboardMediaRef {
  return {
    refId: `tool-result:${imageRef.toolCallId}:${imageRef.assetIndex}`,
    role: 'source',
    locator: {
      type: 'tool-result',
      toolCallId: imageRef.toolCallId,
      assetIndex: imageRef.assetIndex,
    },
    ...((imageRef.label ?? imageRef.alias) ? { label: imageRef.label ?? imageRef.alias } : {}),
    ...(imageRef.mimeType ? { mimeType: imageRef.mimeType } : {}),
    ...(imageRef.resourceRef ? { documentResourceRef: imageRef.resourceRef } : {}),
  };
}

function collectSequentialStoryboardImageRefs(
  toolCalls: ReadonlyMap<string, ToolCall>,
): readonly InferredStoryboardImageRef[] {
  const refs: InferredStoryboardImageRef[] = [];
  for (const toolCall of toolCalls.values()) {
    if (!isStoryboardImageSourceTool(toolCall.name) || toolCall.result?.success !== true) {
      continue;
    }

    for (const candidate of collectMediaCandidates(toolCall)) {
      if (candidate.type !== 'image' || !isImageCandidateResolvable(candidate)) continue;
      const pageNumber = candidate.pageNumber ?? readPageNumberFromText(candidate.label);
      const alias =
        normalizeStoryboardAlias(candidate.alias) ??
        (pageNumber !== undefined
          ? `page_${pageNumber}`
          : normalizeStoryboardAlias(candidate.label));
      const sourceDocumentId =
        candidate.sourceDocumentId ?? readDocumentResourceSourceId(candidate.resourceRef);
      const aliasScope =
        candidate.aliasScope ??
        (sourceDocumentId ? `document:${sourceDocumentId}` : `tool:${toolCall.id}`);
      refs.push({
        toolCallId: toolCall.id,
        assetIndex: candidate.assetIndex,
        batchKey: candidate.aliasScope ?? sourceDocumentId ?? toolCall.id,
        ...(candidate.label ? { label: candidate.label } : {}),
        ...(alias ? { alias } : {}),
        ...(aliasScope ? { aliasScope } : {}),
        ...(sourceDocumentId ? { sourceDocumentId } : {}),
        ...(candidate.entryPath ? { entryPath: candidate.entryPath } : {}),
        ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
        ...(pageNumber !== undefined ? { pageNumber } : {}),
        ...(candidate.resourceRef ? { resourceRef: candidate.resourceRef } : {}),
      });
    }
  }
  return refs;
}

function createStoryboardImageAliasIndex(
  toolCalls: ReadonlyMap<string, ToolCall>,
): StoryboardImageAliasIndex {
  const refs = collectSequentialStoryboardImageRefs(toolCalls);
  return {
    refs,
    batches: groupInferredStoryboardImageRefs(refs, (ref) => ref.batchKey),
    aliases: groupInferredStoryboardImageRefs(refs, (ref) => ref.alias),
    scopedAliases: groupInferredStoryboardImageRefs(refs, (ref) =>
      ref.alias && ref.aliasScope ? `${ref.aliasScope}:${ref.alias}` : undefined,
    ),
    sourceLocators: groupInferredStoryboardImageRefs(refs, (ref) =>
      ref.sourceDocumentId && ref.entryPath
        ? `${ref.sourceDocumentId}:${ref.entryPath}`
        : undefined,
    ),
  };
}

function groupInferredStoryboardImageRefs(
  refs: readonly InferredStoryboardImageRef[],
  keyOf: (ref: InferredStoryboardImageRef) => string | undefined,
): ReadonlyMap<string, readonly InferredStoryboardImageRef[]> {
  const grouped = new Map<string, InferredStoryboardImageRef[]>();
  for (const ref of refs) {
    const key = keyOf(ref);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), ref]);
  }
  return grouped;
}

function selectUniqueAliasRef(
  imageIndex: StoryboardImageAliasIndex,
  alias: string,
):
  | { readonly status: 'none' }
  | { readonly status: 'unique'; readonly ref: InferredStoryboardImageRef }
  | { readonly status: 'ambiguous' } {
  const normalized = normalizeStoryboardAlias(alias);
  if (!normalized) return { status: 'none' };
  const refs = imageIndex.aliases.get(normalized) ?? [];
  const batchKeys = new Set(refs.map((ref) => ref.batchKey));
  if (refs.length === 0) return { status: 'none' };
  if (batchKeys.size === 1 && refs.length === 1) return { status: 'unique', ref: refs[0] };
  if (batchKeys.size === 1) return { status: 'unique', ref: refs[0] };
  return { status: 'ambiguous' };
}

function selectSingleEligibleImageBatch(
  imageIndex: StoryboardImageAliasIndex,
): readonly InferredStoryboardImageRef[] | undefined {
  const batches = Array.from(imageIndex.batches.values()).filter((refs) => refs.length > 0);
  return batches.length === 1 ? batches[0] : undefined;
}

function inferStoryboardShotPageNumber(
  scene: StoryboardTable['scenes'][number],
  shot: StoryboardTable['scenes'][number]['shots'][number],
  section: CompositeSection | undefined,
): number | undefined {
  const sourceImageNumber = readStoryboardSourceImageNumber(shot.extensions);
  if (sourceImageNumber !== undefined) return sourceImageNumber;

  const imageAliasNumber = readStoryboardImageAliasNumber(shot.extensions);
  if (imageAliasNumber !== undefined) return imageAliasNumber;

  const mediaRefTexts = [
    ...(shot.sourceMediaRefs ?? []),
    ...(shot.generatedMediaRefs ?? []),
    ...(shot.mediaRefs ?? []),
  ].flatMap((mediaRef) => [mediaRef.label, mediaRef.refId]);
  const texts = [
    ...mediaRefTexts,
    shot.decisionReason,
    ...(shot.sceneTags ?? []),
    shot.visualDescription,
    shot.characterAction,
    stringifyStoryboardExtensions(shot.extensions),
    section?.heading,
    section?.content,
    scene.sceneTitle,
    scene.summary,
    stringifyStoryboardExtensions(scene.extensions),
  ];

  for (const text of texts) {
    const pageNumber = readPageNumberFromText(text);
    if (pageNumber !== undefined) return pageNumber;
  }
  return undefined;
}

function readStoryboardImageAliasNumber(
  extensions: StoryboardTable['scenes'][number]['shots'][number]['extensions'] | undefined,
): number | undefined {
  const alias = asRecord(extensions?.['neko.storyboardImageAlias']);
  return readPositiveInteger(alias, 'number');
}

function readStoryboardSourceImageNumber(
  extensions: StoryboardTable['scenes'][number]['shots'][number]['extensions'] | undefined,
): number | undefined {
  const sourceImage = asRecord(extensions?.['neko.storyboardSourceImage']);
  return readPositiveInteger(sourceImage, 'number');
}

function isStoryboardImageSourceTool(toolName: string): boolean {
  return toolName === 'ReadImage' || toolName === 'ReadDocument';
}

function isImageCandidateResolvable(candidate: MediaCandidate): boolean {
  return Boolean(candidate.src || candidate.renderUri || candidate.resourceRef);
}

function maybeAlignStoryboardSectionMediaRefs(
  sections: readonly CompositeSection[],
  storyboardTable: StoryboardTable | undefined,
  toolCalls: ReadonlyMap<string, ToolCall>,
): readonly CompositeSection[] {
  if (!storyboardTable) return sections;

  let changed = false;
  const shotRows = storyboardTable.scenes.flatMap((scene) => scene.shots);
  const alignedSections = sections.map((section, sectionIndex) => {
    const shot = shotRows[sectionIndex];
    if (!shot) return section;
    const mediaRefs = collectExplicitStoryboardMediaRefsForSection(shot, toolCalls);
    if (mediaRefs.length === 0) return section;
    changed = true;
    return { ...section, mediaRefs };
  });

  return changed ? alignedSections : sections;
}

function maybeBackfillStoryboardSectionMedia(
  sections: readonly ResolvedCompositeSection[],
  storyboardTable: StoryboardTable | undefined,
  toolCalls: ReadonlyMap<string, ToolCall>,
  diagnostics: CompositeMediaDiagnostic[],
): readonly ResolvedCompositeSection[] {
  if (!storyboardTable) {
    return sections;
  }

  const shotRows = storyboardTable.scenes.flatMap((scene) => scene.shots);
  return sections.map((section) => {
    const shot = shotRows[section.index];
    if (!shot) return section;

    const media: ResolvedCompositeMedia[] = [...section.media];
    const sectionDiagnostics: CompositeMediaDiagnostic[] = [];
    for (const mediaRef of collectExplicitStoryboardDocumentMediaRefs(shot)) {
      const resolved = projectStoryboardDocumentResourceMediaRef(mediaRef, media.length);
      if (resolved && !hasResolvedCompositeMediaResource(media, resolved.resourceRef)) {
        media.push(resolved);
      }
    }

    if (section.media.length === 0) {
      for (const mediaRef of collectExplicitStoryboardMediaRefsForSection(shot, toolCalls)) {
        const resolved = resolveCompositeMediaRef(mediaRef, toolCalls);
        if ('media' in resolved) {
          media.push(resolved.media);
          continue;
        }
        pushDiagnostic(diagnostics, resolved.diagnostic);
        pushDiagnostic(sectionDiagnostics, resolved.diagnostic);
      }
    }

    if (media.length === section.media.length && sectionDiagnostics.length === 0) return section;
    return {
      ...section,
      media,
      diagnostics: [...section.diagnostics, ...sectionDiagnostics],
    };
  });
}

function collectExplicitStoryboardMediaRefsForSection(
  shot: StoryboardTable['scenes'][number]['shots'][number],
  toolCalls: ReadonlyMap<string, ToolCall>,
): readonly MediaRef[] {
  const layeredRefs = [...(shot.sourceMediaRefs ?? []), ...(shot.generatedMediaRefs ?? [])].flatMap(
    (mediaRef) => projectStoryboardMediaRefToCompositeMediaRefForSection(mediaRef, toolCalls),
  );
  return layeredRefs.length > 0
    ? layeredRefs
    : (shot.mediaRefs ?? []).flatMap((mediaRef) =>
        projectStoryboardMediaRefToCompositeMediaRefForSection(mediaRef, toolCalls),
      );
}

function projectStoryboardMediaRefToCompositeMediaRefForSection(
  mediaRef: StoryboardMediaRef,
  toolCalls: ReadonlyMap<string, ToolCall>,
): readonly MediaRef[] {
  if (
    mediaRef.documentResourceRef &&
    mediaRef.locator.type === 'tool-result' &&
    !hasSuccessfulToolResult(mediaRef.locator.toolCallId, toolCalls)
  ) {
    return [];
  }
  return projectStoryboardMediaRefToCompositeMediaRef(mediaRef);
}

function hasSuccessfulToolResult(
  toolCallId: string,
  toolCalls: ReadonlyMap<string, ToolCall>,
): boolean {
  const toolCall = toolCalls.get(toolCallId);
  return toolCall?.result?.success === true;
}

function hasResolvedCompositeMediaResource(
  media: readonly ResolvedCompositeMedia[],
  resourceRef: DocumentArchiveResourceRef | undefined,
): boolean {
  const key = createDocumentResourceCandidateKey(resourceRef);
  if (!key) return false;
  return media.some((item) => createDocumentResourceCandidateKey(item.resourceRef) === key);
}

function collectExplicitStoryboardMediaRefs(
  shot: StoryboardTable['scenes'][number]['shots'][number],
): readonly MediaRef[] {
  const layeredRefs = [...(shot.sourceMediaRefs ?? []), ...(shot.generatedMediaRefs ?? [])].flatMap(
    projectStoryboardMediaRefToCompositeMediaRef,
  );
  return layeredRefs.length > 0
    ? layeredRefs
    : (shot.mediaRefs ?? []).flatMap(projectStoryboardMediaRefToCompositeMediaRef);
}

function projectStoryboardMediaRefToCompositeMediaRef(
  mediaRef: StoryboardMediaRef,
): readonly MediaRef[] {
  if (mediaRef.locator.type !== 'tool-result') return [];
  return [
    {
      toolCallId: mediaRef.locator.toolCallId,
      assetIndex: mediaRef.locator.assetIndex,
      ...(mediaRef.label ? { caption: mediaRef.label } : {}),
      role: mediaRef.role,
    },
  ];
}

function collectExplicitStoryboardDocumentMediaRefs(
  shot: StoryboardTable['scenes'][number]['shots'][number],
): readonly StoryboardMediaRef[] {
  const layeredRefs = [...(shot.sourceMediaRefs ?? []), ...(shot.generatedMediaRefs ?? [])].filter(
    hasStableDocumentResourceRef,
  );
  return layeredRefs.length > 0
    ? layeredRefs
    : (shot.mediaRefs ?? []).filter(hasStableDocumentResourceRef);
}

function hasStableDocumentResourceRef(mediaRef: StoryboardMediaRef): boolean {
  return parseStableDocumentArchiveResourceRef(mediaRef.documentResourceRef) !== undefined;
}

function projectStoryboardDocumentResourceMediaRef(
  mediaRef: StoryboardMediaRef,
  assetIndex: number,
): ResolvedCompositeMedia | undefined {
  const resourceRef = parseStableDocumentArchiveResourceRef(mediaRef.documentResourceRef);
  if (!resourceRef) return undefined;
  return {
    id: [
      'storyboard-document-resource',
      mediaRef.refId,
      createDocumentResourceCandidateKey(resourceRef) ?? resourceRef.entryPath,
    ].join(':'),
    toolCallId: mediaRef.refId,
    assetIndex,
    type: inferMediaType(mediaRef.mimeType, resourceRef.entryPath, 'image'),
    src: '',
    resourceRef,
    ...(mediaRef.mimeType ? { mimeType: mediaRef.mimeType } : {}),
    ...(mediaRef.label ? { caption: mediaRef.label, label: mediaRef.label } : {}),
    role: mediaRef.role,
  };
}

function projectCompositeSection(input: {
  readonly section: CompositeSection;
  readonly sectionIndex: number;
  readonly toolCalls: ReadonlyMap<string, ToolCall>;
  readonly diagnostics: CompositeMediaDiagnostic[];
}): ResolvedCompositeSection {
  const sectionDiagnostics: CompositeMediaDiagnostic[] = [];
  const media: ResolvedCompositeMedia[] = [];

  for (const mediaRef of input.section.mediaRefs ?? []) {
    const resolved = resolveCompositeMediaRef(mediaRef, input.toolCalls);
    if ('media' in resolved) {
      media.push(resolved.media);
      continue;
    }

    pushDiagnostic(sectionDiagnostics, resolved.diagnostic);
    pushDiagnostic(input.diagnostics, resolved.diagnostic);
  }

  return {
    id: `section-${input.sectionIndex}`,
    index: input.sectionIndex,
    ...(input.section.heading ? { heading: input.section.heading } : {}),
    ...(input.section.content ? { content: input.section.content } : {}),
    ...(input.section.layout ? { layout: input.section.layout } : {}),
    media,
    diagnostics: sectionDiagnostics,
  };
}

function resolveCompositeMediaRef(
  mediaRef: MediaRef,
  toolCalls: ReadonlyMap<string, ToolCall>,
): { readonly media: ResolvedCompositeMedia } | { readonly diagnostic: CompositeMediaDiagnostic } {
  const assetIndex = mediaRef.assetIndex ?? 0;
  const toolCall = toolCalls.get(mediaRef.toolCallId);
  if (!toolCall?.result || toolCall.result.success !== true) {
    const resolvedAlias = resolveMissingReadImageAlias(mediaRef, toolCalls, assetIndex);
    if (resolvedAlias) return { media: resolvedAlias };
    return {
      diagnostic: {
        code: 'missing-tool-result',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        message: `Tool result is not ready for ${mediaRef.toolCallId}`,
      },
    };
  }

  const candidates = collectMediaCandidates(toolCall);
  const candidate = resolveMediaCandidateByAssetIndex(candidates, assetIndex);
  if (!candidate) {
    return {
      diagnostic: {
        code: 'missing-asset',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        message: `Asset ${assetIndex} is not available for ${mediaRef.toolCallId}`,
      },
    };
  }

  if (candidate.type === 'model' && !candidate.src && !candidate.renderUri) {
    return {
      diagnostic: {
        code: 'missing-uri',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
        message: `Asset ${assetIndex} does not have an adapter-provided model URI`,
      },
    };
  }

  if (
    !candidate.src &&
    !candidate.renderUri &&
    candidate.type !== 'model' &&
    !isImageCandidateResolvable(candidate)
  ) {
    return {
      diagnostic: {
        code: 'missing-uri',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
        message: `Asset ${assetIndex} does not have a renderable webview URI`,
      },
    };
  }

  return {
    media: {
      id: [
        mediaRef.toolCallId,
        assetIndex,
        candidate.assetId ??
          createDocumentResourceCandidateKey(candidate.resourceRef) ??
          candidate.stableUri ??
          candidate.renderUri ??
          candidate.src,
      ].join(':'),
      toolCallId: mediaRef.toolCallId,
      assetIndex,
      type: candidate.type,
      src: candidate.src ?? candidate.renderUri ?? '',
      ...(candidate.renderUri ? { renderUri: candidate.renderUri } : {}),
      ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
      ...(candidate.stableUri ? { stableUri: candidate.stableUri } : {}),
      ...(candidate.localPath ? { localPath: candidate.localPath } : {}),
      ...(candidate.resourceRef ? { resourceRef: candidate.resourceRef } : {}),
      ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
      ...(mediaRef.caption || candidate.label
        ? { caption: mediaRef.caption ?? candidate.label }
        : {}),
      ...(mediaRef.role ? { role: mediaRef.role } : {}),
      ...(candidate.label ? { label: candidate.label } : {}),
    },
  };
}

function resolveMediaCandidateByAssetIndex(
  candidates: readonly MediaCandidate[],
  assetIndex: number,
): MediaCandidate | undefined {
  const exact = candidates.find((candidate) => candidate.assetIndex === assetIndex);
  if (exact) return exact;
  const positional = candidates[assetIndex];
  return positional?.assetIndex === assetIndex ? positional : undefined;
}

function resolveMissingReadImageAlias(
  mediaRef: MediaRef,
  toolCalls: ReadonlyMap<string, ToolCall>,
  assetIndex: number,
): ResolvedCompositeMedia | undefined {
  if (!isReadImageCurrentResultAlias(mediaRef.toolCallId)) return undefined;
  const imageIndex = createStoryboardImageAliasIndex(toolCalls);
  const batch = selectSingleEligibleImageBatch(imageIndex);
  const imageRef = batch?.[assetIndex];
  if (!imageRef) return undefined;
  const resolved = resolveCompositeMediaRef(
    {
      ...mediaRef,
      toolCallId: imageRef.toolCallId,
      assetIndex: imageRef.assetIndex,
      caption: mediaRef.caption ?? imageRef.label ?? imageRef.alias,
    },
    toolCalls,
  );
  return 'media' in resolved ? resolved.media : undefined;
}

function isReadImageCurrentResultAlias(toolCallId: string): boolean {
  const normalized = toolCallId.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalized === 'readimagecurrentresult';
}

function isRepairableStoryboardToolResultAlias(toolCallId: string): boolean {
  return isReadImageCurrentResultAlias(toolCallId) || /^readimage[.-]/i.test(toolCallId);
}

function collectToolCalls(
  siblingBlocks: readonly ContentBlock[] | undefined,
  toolCalls: readonly ToolCall[] | undefined,
): ReadonlyMap<string, ToolCall> {
  const byId = new Map<string, ToolCall>();
  for (const block of siblingBlocks ?? []) {
    if (block.type === 'tool_call' && block.toolCall) {
      byId.set(block.toolCall.id, block.toolCall);
    }
  }
  for (const toolCall of toolCalls ?? []) {
    byId.set(toolCall.id, toolCall);
  }
  return byId;
}

function collectMediaCandidates(toolCall: ToolCall): readonly MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const seen = new Set<string>();
  const data = asRecord(toolCall.result?.data);

  const addCandidate = (candidate: MediaCandidate): void => {
    const key =
      candidate.assetId ??
      createDocumentResourceCandidateKey(candidate.resourceRef) ??
      candidate.stableUri ??
      candidate.renderUri ??
      candidate.src ??
      candidate.localPath;
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const [index, asset] of readRecordArray(data, 'assets').entries()) {
    addCandidate(projectGeneratedAssetCandidate(asset, index));
  }

  for (const [index, asset] of readRecordArray(data, 'generatedAssets').entries()) {
    addCandidate(projectGeneratedAssetCandidate(asset, index));
  }

  for (const [index, ref] of readRecordArray(data, 'resultAssetRefs').entries()) {
    addCandidate(projectAssetRefCandidate(ref, index));
  }

  const thumbnailRef = asRecord(data?.['thumbnailAssetRef']);
  if (thumbnailRef) {
    addCandidate(projectAssetRefCandidate(thumbnailRef, 0, 'thumbnail'));
  }

  for (const candidate of collectDocumentImageCandidates(data)) {
    addCandidate(candidate);
  }

  for (const candidate of collectReadImageCandidates(data)) {
    addCandidate(candidate);
  }

  for (const [index, attachment] of (toolCall.result?.attachments ?? []).entries()) {
    addCandidate(projectAttachmentCandidate(attachment, index));
  }

  for (const [index, url] of collectResultUrls(data).entries()) {
    const renderUri = isRenderableUri(url) ? url : undefined;
    const stableUri = isGeneratedAssetResultMediaUri(url) ? url : undefined;
    addCandidate({
      assetIndex: index,
      src: renderUri ?? stableUri,
      ...(renderUri ? { renderUri } : {}),
      ...(stableUri ? { stableUri } : {}),
      type: inferMediaType(readString(data, 'mimeType'), url),
      label: `Asset ${index + 1}`,
    });
  }

  return candidates;
}

function collectDocumentImageCandidates(
  data: Record<string, unknown> | undefined,
): readonly MediaCandidate[] {
  if (!data) return [];

  const imageInfo = readRecordArray(data, 'imageInfo');
  const candidates: MediaCandidate[] = [];

  for (let index = 0; index < imageInfo.length; index += 1) {
    const info = imageInfo[index];
    const candidate = projectDocumentImageCandidate({
      index,
      info,
      allowLocalPath: false,
      label: readString(info, 'label') ?? formatDocumentImageCandidateLabel(info, index),
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function collectReadImageCandidates(
  data: Record<string, unknown> | undefined,
): readonly MediaCandidate[] {
  return readRecordArray(data, 'images').flatMap((image, index) => {
    const documentImage = asRecord(image['documentImage']);
    const info = {
      ...(documentImage ?? {}),
      ...image,
      ...(documentImage?.['resourceRef'] !== undefined
        ? { resourceRef: documentImage['resourceRef'] }
        : {}),
    };
    const candidate = projectDocumentImageCandidate({
      index,
      info,
      path: readString(image, 'path') ?? readString(documentImage, 'path'),
      renderUri: readRenderableUri(image) ?? readRenderableUri(documentImage),
      allowLocalPath: false,
      label: readString(image, 'label') ?? formatDocumentImageCandidateLabel(documentImage, index),
    });
    return candidate ? [candidate] : [];
  });
}

function projectDocumentImageCandidate(input: {
  readonly index: number;
  readonly info?: Record<string, unknown>;
  readonly path?: string;
  readonly renderUri?: string;
  readonly allowLocalPath: boolean;
  readonly label?: string;
}): MediaCandidate | null {
  const mimeType = readString(input.info, 'mimeType') ?? inferImageMimeType(input.path);
  const renderUri =
    input.renderUri && isRenderableUri(input.renderUri) ? input.renderUri : undefined;
  const resourceRef = parseStableDocumentArchiveResourceRef(input.info?.['resourceRef']);
  if (!resourceRef && !renderUri) return null;
  const pageNumber = readDocumentImagePageNumber(input.info) ?? readPageNumberFromText(input.label);
  const alias = normalizeStoryboardAlias(readString(input.info, 'alias'));
  const sourceDocumentId =
    readString(input.info, 'sourceDocumentId') ?? readDocumentResourceSourceId(resourceRef);
  const entryPath = readString(input.info, 'entryPath') ?? resourceRef?.entryPath;
  return {
    assetIndex: input.index,
    type: 'image',
    ...(renderUri && !resourceRef ? { src: renderUri, renderUri } : {}),
    ...(resourceRef ? { resourceRef } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(alias ? { alias } : {}),
    ...(readString(input.info, 'aliasScope')
      ? { aliasScope: readString(input.info, 'aliasScope') }
      : {}),
    ...(sourceDocumentId ? { sourceDocumentId } : {}),
    ...(entryPath ? { entryPath } : {}),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
  };
}

function createDocumentResourceCandidateKey(
  resourceRef: DocumentArchiveResourceRef | undefined,
): string | undefined {
  if (!resourceRef) return undefined;
  const sourceKey =
    resourceRef.source.identity?.hash ??
    resourceRef.source.identity?.fileId ??
    resourceRef.source.fileId ??
    resourceRef.source.filePath;
  const entryKey =
    resourceRef.entryPath ??
    (resourceRef.locator?.kind === 'page' || resourceRef.locator?.kind === 'region'
      ? resourceRef.locator.entryName
      : undefined);
  return sourceKey && entryKey ? `document-entry:${sourceKey}:${entryKey}` : undefined;
}

function readDocumentResourceSourceId(
  resourceRef: DocumentArchiveResourceRef | undefined,
): string | undefined {
  if (!resourceRef) return undefined;
  return (
    resourceRef.source.identity?.hash ??
    resourceRef.source.identity?.fileId ??
    resourceRef.source.fileId ??
    resourceRef.source.filePath
  );
}

function normalizeStoryboardAlias(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().replace(/[\s-]+/g, '_');
}

function projectGeneratedAssetCandidate(
  asset: Record<string, unknown>,
  index: number,
): MediaCandidate {
  const assetRef = asRecord(asset['assetRef']);
  const mimeType = readString(asset, 'mimeType') ?? readString(assetRef, 'mimeType');
  const renderUri = readRenderableUri(asset) ?? readRenderableUri(assetRef);
  const stableUri = readString(assetRef, 'uri');
  const src =
    renderUri ?? readGeneratedAssetResultUri(asset) ?? readGeneratedAssetResultUri(assetRef);

  return {
    assetIndex: index,
    type: inferGeneratedAssetType(readString(asset, 'type'), mimeType),
    ...(src ? { src } : {}),
    ...(renderUri ? { renderUri } : {}),
    ...((readString(asset, 'id') ?? readString(assetRef, 'assetId'))
      ? { assetId: readString(asset, 'id') ?? readString(assetRef, 'assetId') }
      : {}),
    ...(stableUri ? { stableUri } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(readString(asset, 'label') ? { label: readString(asset, 'label') } : {}),
  };
}

function projectAssetRefCandidate(
  assetRef: Record<string, unknown>,
  index: number,
  label?: string,
): MediaCandidate {
  const mimeType = readString(assetRef, 'mimeType');
  const stableUri = readString(assetRef, 'uri');
  const renderUri = readRenderableUri(assetRef);
  const src = renderUri ?? readGeneratedAssetResultUri(assetRef);

  return {
    assetIndex: index,
    type: inferMediaType(mimeType, stableUri),
    ...(src ? { src } : {}),
    ...(renderUri ? { renderUri } : {}),
    ...(readString(assetRef, 'assetId') ? { assetId: readString(assetRef, 'assetId') } : {}),
    ...(stableUri ? { stableUri } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...((label ?? readString(assetRef, 'label'))
      ? { label: label ?? readString(assetRef, 'label') }
      : {}),
  };
}

function projectAttachmentCandidate(
  attachment: ToolResultAttachment,
  index: number,
): MediaCandidate {
  const attachmentRecord = asRecord(attachment);
  const assetRef = asRecord(attachmentRecord?.['assetRef']);
  const mimeType = attachment.mimeType ?? readString(assetRef, 'mimeType');
  const renderUri = readRenderableUri(attachmentRecord) ?? readRenderableUri(assetRef);
  const src =
    renderUri ??
    readGeneratedAssetResultUri(attachmentRecord) ??
    readGeneratedAssetResultUri(assetRef);
  const stableUri = readString(assetRef, 'uri') ?? readPortableSourcePath(attachment.path);

  return {
    assetIndex: index,
    type: inferMediaType(mimeType, stableUri, attachment.type),
    ...(src ? { src } : {}),
    ...(renderUri ? { renderUri } : {}),
    ...(readString(assetRef, 'assetId') ? { assetId: readString(assetRef, 'assetId') } : {}),
    ...(stableUri ? { stableUri } : {}),
    ...(mimeType ? { mimeType } : {}),
    label: `Attachment ${index + 1}`,
  };
}

function collectResultUrls(data: Record<string, unknown> | undefined): readonly string[] {
  const urls = new Set<string>();
  for (const key of ['url', 'thumbnailUrl', 'imageUrl', 'videoUrl', 'audioUrl', 'src']) {
    const value = readString(data, key);
    if (value) urls.add(value);
  }
  for (const value of readStringArray(data, 'urls')) {
    urls.add(value);
  }
  return Array.from(urls);
}

function readGeneratedAssetResultUri(
  record: Record<string, unknown> | undefined,
): string | undefined {
  const uri = readString(record, 'uri') ?? readString(record, 'url') ?? readString(record, 'src');
  return uri && isGeneratedAssetResultMediaUri(uri) ? uri : undefined;
}

function readRenderableUri(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const key of [
    'renderUri',
    'previewUri',
    'preview',
    'thumbnailUrl',
    'url',
    'imageUrl',
    'videoUrl',
    'audioUrl',
    'src',
  ]) {
    const value = readString(record, key);
    if (value && isRenderableUri(value)) return value;
  }
  return undefined;
}

function inferGeneratedAssetType(
  assetType: string | undefined,
  mimeType: string | undefined,
): CompositeMediaType {
  if (assetType === 'generated-video') return 'video';
  if (assetType === 'generated-audio') return 'audio';
  if (assetType === 'generated-image' || assetType === 'generated-storyboard') return 'image';
  if (assetType === 'generated-model') return 'model';
  return inferMediaType(mimeType);
}

function inferMediaType(
  mimeType: string | undefined,
  uri?: string,
  fallback?: CompositeMediaType,
): CompositeMediaType {
  if (fallback) return fallback;
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  if (isModelMimeType(mimeType)) return 'model';

  const lowerUri = uri?.toLowerCase() ?? '';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/.test(lowerUri)) return 'image';
  if (/\.(mp4|webm|mov|avi|mkv)(\?|#|$)/.test(lowerUri)) return 'video';
  if (/\.(mp3|wav|ogg|aac|flac|m4a)(\?|#|$)/.test(lowerUri)) return 'audio';
  if (/\.(glb|gltf|vrm)(\?|#|$)/.test(lowerUri)) return 'model';
  return 'unknown';
}

function inferImageMimeType(path: string | undefined): string | undefined {
  const lowerPath = path?.toLowerCase() ?? '';
  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerPath.endsWith('.png')) return 'image/png';
  if (lowerPath.endsWith('.webp')) return 'image/webp';
  if (lowerPath.endsWith('.gif')) return 'image/gif';
  if (lowerPath.endsWith('.bmp')) return 'image/bmp';
  if (lowerPath.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}

function formatDocumentImageCandidateLabel(
  info: Record<string, unknown> | undefined,
  index: number,
): string {
  const locator = asRecord(info?.['locator']);
  if (locator) {
    const kind = readString(locator, 'kind');
    if (kind === 'page') {
      const pageNumber = readFiniteNumber(locator, 'pageNumber');
      return pageNumber === undefined ? `page ${index + 1}` : `page ${pageNumber}`;
    }
    if (kind === 'chapter') {
      return (
        readString(locator, 'title') ?? readString(locator, 'chapterHref') ?? `image ${index + 1}`
      );
    }
    if (kind === 'slide') {
      const slideNumber = readFiniteNumber(locator, 'slideNumber');
      return slideNumber === undefined ? `slide ${index + 1}` : `slide ${slideNumber}`;
    }
  }
  return `image ${index + 1}`;
}

function readDocumentImagePageNumber(
  info: Record<string, unknown> | undefined,
): number | undefined {
  const locator = asRecord(info?.['locator']);
  const pageNumber = readPositiveInteger(locator, 'pageNumber');
  if (pageNumber !== undefined) return pageNumber;
  return readPageNumberFromText(readString(locator, 'label') ?? readString(info, 'label'));
}

function readPageNumberFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const patterns = [
    /\[\s*(?:image|img|图|图片)\s*#?\s*(\d{1,4})\s*\]/i,
    /\b(?:page|image|panel)[_-](\d{1,4})\b/i,
    /\b(?:image|img|panel)\s*[:#-]?\s*(\d{1,4})\b/i,
    /\bpage\s*[:#-]?\s*(\d{1,4})\b/i,
    /\bp\s*[:#-]?\s*(\d{1,4})\b/i,
    /(?:图|图片)\s*[:：#-]?\s*(\d{1,4})/,
    /第\s*(\d{1,4})\s*页/,
    /页\s*[:#-]?\s*(\d{1,4})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const pageNumber = parsePositiveInteger(match?.[1]);
    if (pageNumber !== undefined) return pageNumber;
  }
  return undefined;
}

function stringifyStoryboardExtensions(
  extensions: StoryboardTable['extensions'] | undefined,
): string | undefined {
  if (!extensions) return undefined;
  return JSON.stringify(extensions);
}

function isModelMimeType(mimeType: string | undefined): boolean {
  return (
    mimeType === 'model/gltf-binary' ||
    mimeType === 'model/gltf+json' ||
    mimeType === 'model/vrm' ||
    mimeType === 'application/octet-stream+glb' ||
    mimeType === 'application/x-vrm'
  );
}

function isRenderableUri(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('file://')) return false;
  if (value.startsWith('data:')) return false;
  if (value.startsWith('${')) return false;
  if (isAbsolutePath(value)) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('webview://')) return true;
  return value.includes('vscode-resource') || value.includes('vscode-webview');
}

function isGeneratedAssetResultMediaUri(value: string): boolean {
  if (!value.startsWith('generated-assets/')) return false;
  if (!isPublicGeneratedAssetResultUri(value)) return false;
  return inferMediaType(undefined, value) !== 'unknown';
}

function pushDiagnostic(
  diagnostics: CompositeMediaDiagnostic[],
  diagnostic: CompositeMediaDiagnostic,
): void {
  if (diagnostics.length >= MAX_COMPOSITE_MEDIA_DIAGNOSTICS) return;
  diagnostics.push(diagnostic);
}

function readRecordArray(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown>[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readStringArray(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseStableDocumentArchiveResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | undefined {
  const ref = parseDocumentArchiveResourceRef(value);
  if (!ref) return undefined;
  return ref;
}

function readFiniteNumber(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readPositiveInteger(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readPortableSourcePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('blob:') || value.startsWith('file:')) return undefined;
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.neko/.cache/')) return undefined;
  if (isAbsolutePath(value)) return undefined;
  return value;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
