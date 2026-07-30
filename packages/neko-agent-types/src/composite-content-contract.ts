import type { CompositeBlockData, CompositeSection, MediaRef } from './message';
import {
  hasBlockingStoryboardDiagnostics,
  normalizeCanonicalStoryboardTable,
  normalizeStoryboardTable,
  normalizeStoryboardPlanOverlay,
  type ArtifactExtensionMap,
  type ArtifactJsonValue,
  type StoryboardMediaRef,
  type StoryboardPlanOverlay,
  type StoryboardTable,
  type StoryboardValidationDiagnostic,
} from '@neko/shared';

export const COMPOSITE_CONTENT_FENCE_LANGUAGES = [
  'neko',
  'neko-json',
  'neko-composite',
  'neko-composite-json',
  'json',
] as const;

export interface CompositeContentFenceCandidate {
  readonly language: string;
  readonly rawJson: string;
  readonly value: unknown;
}

interface CompositeContentEnvelope {
  readonly kind?: string;
  readonly composite?: unknown;
  readonly composites?: unknown;
}

const MAX_COMPOSITE_SECTIONS = 200;
const MAX_SECTION_MEDIA_REFS = 12;
const MAX_STORYBOARD_DIAGNOSTIC_SECTIONS = 8;
const STORYBOARD_DOMAIN_KIND = 'StoryboardTable';
const ANIMATION_PLAN_DOMAIN_KIND = 'AnimationPlan';

const COMPOSITE_CONTENT_FENCE_LANGUAGE_SET = new Set<string>(COMPOSITE_CONTENT_FENCE_LANGUAGES);
const COMPOSITE_CONTENT_FENCE_PATTERN = /(```|~~~)([^\n]*)\n([\s\S]*?)\1/g;

export function isCompositeContentFenceLanguage(info: string | undefined): boolean {
  const language = normalizeFenceLanguage(info);
  return language !== '' && COMPOSITE_CONTENT_FENCE_LANGUAGE_SET.has(language);
}

export function extractCompositeContentFenceCandidates(
  markdown: string,
): readonly CompositeContentFenceCandidate[] {
  const candidates: CompositeContentFenceCandidate[] = [];
  for (const match of markdown.matchAll(COMPOSITE_CONTENT_FENCE_PATTERN)) {
    const info = match[2];
    const rawJson = match[3];
    if (!isCompositeContentFenceLanguage(info) || !rawJson) continue;

    const language = normalizeFenceLanguage(info);
    for (const value of parseCompositeContentJsonCandidates(rawJson)) {
      candidates.push({ language, rawJson, value });
    }
  }
  return candidates;
}

export function parseCompositeContentJsonCandidates(json: string): readonly unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  return Array.isArray(parsed) ? parsed : isRecord(parsed) ? readEnvelopeCandidates(parsed) : [];
}

export function parseCompositeContentJson(json: string): readonly CompositeBlockData[] {
  return parseCompositeContentJsonCandidates(json).flatMap((candidate) => {
    const composite = normalizeCompositeBlock(candidate);
    return composite ? [composite] : [];
  });
}

function normalizeFenceLanguage(info: string | undefined): string {
  return info?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function readEnvelopeCandidates(envelope: CompositeContentEnvelope): readonly unknown[] {
  if (Array.isArray(envelope.composites)) return envelope.composites;
  if (envelope.composite !== undefined) return [envelope.composite];
  return [envelope];
}

function normalizeCompositeBlock(value: unknown): CompositeBlockData | null {
  if (!isRecord(value)) return null;
  const artifactBackedStoryboard = normalizeArtifactBackedStoryboardBlock(value);
  if (artifactBackedStoryboard) return artifactBackedStoryboard;

  const template = value.template;
  if (
    template !== 'storyboard-table' &&
    template !== 'comparison' &&
    template !== 'gallery' &&
    template !== 'report'
  ) {
    return null;
  }

  const semanticStoryboard =
    template === 'storyboard-table' && (value.schemaVersion === 1 || value.scenes !== undefined)
      ? normalizeStoryboardCompositePayload(value)
      : undefined;
  const title = readString(value, 'title') ?? semanticStoryboard?.displayTable?.title;
  const sections = normalizeCompositeSections(value.sections);
  const projectedSections =
    template === 'storyboard-table'
      ? createStoryboardDisplaySections(
          semanticStoryboard?.displayTable,
          semanticStoryboard?.diagnostics,
        )
      : [];
  const normalizedSections = sections.length > 0 ? sections : projectedSections;
  if (normalizedSections.length === 0) return null;

  return {
    template,
    ...(title ? { title } : {}),
    ...(semanticStoryboard?.canonicalTable
      ? { storyboardTable: semanticStoryboard.canonicalTable }
      : {}),
    ...(semanticStoryboard?.diagnostics && semanticStoryboard.diagnostics.length > 0
      ? { storyboardDiagnostics: semanticStoryboard.diagnostics }
      : {}),
    ...projectExtensions(value.extensions),
    sections: normalizedSections,
  };
}

interface NormalizedStoryboardCompositePayload {
  readonly displayTable?: StoryboardTable;
  readonly canonicalTable?: StoryboardTable;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

function normalizeStoryboardCompositePayload(value: unknown): NormalizedStoryboardCompositePayload {
  const display = normalizeStoryboardTable({ value });
  const canonical = normalizeCanonicalStoryboardTable({ value });
  const diagnostics = dedupeStoryboardDiagnostics([
    ...display.diagnostics,
    ...canonical.diagnostics,
  ]);
  return {
    ...(display.table ? { displayTable: display.table } : {}),
    ...(canonical.table ? { canonicalTable: canonical.table } : {}),
    diagnostics,
  };
}

function dedupeStoryboardDiagnostics(
  diagnostics: readonly StoryboardValidationDiagnostic[],
): readonly StoryboardValidationDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.severity}:${diagnostic.code}:${diagnostic.path.join('.')}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeArtifactBackedStoryboardBlock(
  value: Record<string, unknown>,
): CompositeBlockData | null {
  if (value.kind !== 'composite-artifact' || value.schemaVersion !== 1) return null;
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  const storyboardBlock = blocks.find(isStoryboardDomainBlock);
  const animationPlanBlocks = blocks.filter(isAnimationPlanDomainBlock);
  if (!storyboardBlock && animationPlanBlocks.length > 0) {
    const storyboardPlanOverlays = normalizeStoryboardPlanBlocks(animationPlanBlocks, undefined);
    if (storyboardPlanOverlays.length === 0) return null;
    return {
      template: 'storyboard-table',
      title: readString(value, 'title') ?? 'Animation Plan',
      storyboardPlanOverlays,
      sections: createAnimationPlanSummarySections(storyboardPlanOverlays),
    };
  }
  if (!storyboardBlock) return null;

  const semanticStoryboard = normalizeStoryboardCompositePayload(storyboardBlock.payload);
  const storyboardPlanOverlays = normalizeStoryboardPlanBlocks(
    animationPlanBlocks,
    semanticStoryboard.canonicalTable,
  );
  const title =
    readString(storyboardBlock, 'title') ??
    readString(value, 'title') ??
    semanticStoryboard.displayTable?.title;
  const sections = createStoryboardDisplaySections(
    semanticStoryboard.displayTable,
    semanticStoryboard.diagnostics,
  );
  if (sections.length === 0) return null;
  const extensions = mergeExtensions(value.extensions, storyboardBlock.extensions);

  return {
    template: 'storyboard-table',
    ...(title ? { title } : {}),
    ...(semanticStoryboard.canonicalTable
      ? { storyboardTable: semanticStoryboard.canonicalTable }
      : {}),
    ...(storyboardPlanOverlays.length > 0 ? { storyboardPlanOverlays } : {}),
    ...(semanticStoryboard.diagnostics.length > 0
      ? { storyboardDiagnostics: semanticStoryboard.diagnostics }
      : {}),
    ...projectExtensions(extensions),
    sections,
  };
}

function createAnimationPlanSummarySections(
  overlays: readonly StoryboardPlanOverlay[],
): readonly CompositeSection[] {
  return overlays.flatMap((overlay) =>
    overlay.shotOverlays.slice(0, MAX_COMPOSITE_SECTIONS).map((shotOverlay, index) => ({
      heading: `${overlay.overlayType} / ${shotOverlay.shotId}`,
      content: [
        'Source storyboard unavailable; this is an execution overlay summary, not a complete storyboard.',
        shotOverlay.motionIntent ? `Motion: ${shotOverlay.motionIntent}` : undefined,
        shotOverlay.cameraIntent ? `Camera: ${shotOverlay.cameraIntent}` : undefined,
        shotOverlay.videoPromptIntent?.positive
          ? `Video prompt: ${shotOverlay.videoPromptIntent.positive}`
          : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      layout: 'table-row' as const,
      extensions: {
        'neko.storyboardPlanSummary': {
          overlayType: overlay.overlayType,
          shotId: shotOverlay.shotId,
          index,
        },
      },
    })),
  );
}

function normalizeStoryboardPlanBlocks(
  blocks: readonly Record<string, unknown>[],
  storyboardTable: StoryboardTable | undefined,
): readonly StoryboardPlanOverlay[] {
  return blocks.flatMap((block) => {
    const normalized = normalizeStoryboardPlanOverlay(
      {
        kind: 'domain',
        domainKind: block.domainKind,
        payload: block.payload,
      },
      { sourceStoryboard: storyboardTable },
    );
    return normalized.overlay ? [normalized.overlay] : [];
  });
}

function isStoryboardDomainBlock(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.kind === 'domain' &&
    value.domainKind === STORYBOARD_DOMAIN_KIND &&
    value.payload !== undefined
  );
}

function isAnimationPlanDomainBlock(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.kind === 'domain' &&
    value.domainKind === ANIMATION_PLAN_DOMAIN_KIND &&
    value.payload !== undefined
  );
}

function normalizeCompositeSections(value: unknown): readonly CompositeSection[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.slice(0, MAX_COMPOSITE_SECTIONS).flatMap((section) => {
    const normalized = normalizeCompositeSection(section);
    return normalized ? [normalized] : [];
  });
}

function createStoryboardDisplaySections(
  table: StoryboardTable | undefined,
  diagnostics: readonly StoryboardValidationDiagnostic[] | undefined,
): readonly CompositeSection[] {
  if (table) {
    return table.scenes.flatMap((scene) =>
      scene.shots.map((shot) => ({
        heading: `${scene.sceneTitle} / Shot ${shot.shotNumber}`,
        content: shot.visualDescription,
        layout: 'table-row' as const,
        mediaRefs: projectStoryboardMediaRefsToComposite(collectStoryboardShotMediaRefs(shot)),
      })),
    );
  }

  if (!diagnostics || diagnostics.length === 0) return [];
  const blocking = hasBlockingStoryboardDiagnostics(diagnostics);
  return [
    {
      heading: blocking ? 'Storyboard validation failed' : 'Storyboard diagnostics',
      content: diagnostics
        .slice(0, MAX_STORYBOARD_DIAGNOSTIC_SECTIONS)
        .map((diagnostic) => {
          const path = diagnostic.path.length > 0 ? ` at ${diagnostic.path.join('.')}` : '';
          return `[${diagnostic.severity}] ${diagnostic.code}${path}: ${diagnostic.message}`;
        })
        .join('\n'),
      layout: 'table-row',
    },
  ];
}

function collectStoryboardShotMediaRefs(
  shot: StoryboardTable['scenes'][number]['shots'][number],
): readonly StoryboardMediaRef[] | undefined {
  const refs = dedupeStoryboardMediaRefs([
    ...(shot.sourceMediaRefs ?? []),
    ...(shot.generatedMediaRefs ?? []),
    ...(shot.mediaRefs ?? []),
  ]);
  return refs.length > 0 ? refs : undefined;
}

function dedupeStoryboardMediaRefs(
  mediaRefs: readonly StoryboardMediaRef[],
): readonly StoryboardMediaRef[] {
  const seen = new Set<string>();
  const refs: StoryboardMediaRef[] = [];
  for (const mediaRef of mediaRefs) {
    const key = `${mediaRef.refId}:${JSON.stringify(mediaRef.locator)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(mediaRef);
  }
  return refs;
}

function projectStoryboardMediaRefsToComposite(
  mediaRefs: StoryboardTable['scenes'][number]['shots'][number]['mediaRefs'],
): readonly MediaRef[] | undefined {
  const refs = (mediaRefs ?? []).flatMap((mediaRef) => {
    if (mediaRef.locator.type !== 'tool-result') return [];
    return [
      {
        toolCallId: mediaRef.locator.toolCallId,
        assetIndex: mediaRef.locator.assetIndex,
        ...(mediaRef.label ? { caption: mediaRef.label } : {}),
        role: mediaRef.role,
      },
    ];
  });
  return refs.length > 0 ? refs : undefined;
}

function normalizeCompositeSection(value: unknown): CompositeSection | null {
  if (!isRecord(value)) return null;
  const mediaRefs = Array.isArray(value.mediaRefs)
    ? value.mediaRefs.slice(0, MAX_SECTION_MEDIA_REFS).flatMap((mediaRef) => {
        const normalized = normalizeMediaRef(mediaRef);
        return normalized ? [normalized] : [];
      })
    : undefined;
  const heading = readString(value, 'heading');
  const content = readString(value, 'content');
  const layout = normalizeSectionLayout(value.layout);

  if (!heading && !content && (!mediaRefs || mediaRefs.length === 0)) return null;

  return {
    ...(heading ? { heading } : {}),
    ...(content ? { content } : {}),
    ...(mediaRefs && mediaRefs.length > 0 ? { mediaRefs } : {}),
    ...(layout ? { layout } : {}),
    ...projectExtensions(value.extensions),
  };
}

function normalizeMediaRef(value: unknown): MediaRef | null {
  if (!isRecord(value)) return null;
  const toolCallId = readString(value, 'toolCallId');
  if (!toolCallId) return null;

  const assetIndex = readNonNegativeInteger(value.assetIndex);
  return {
    toolCallId,
    ...(assetIndex !== undefined ? { assetIndex } : {}),
    ...(readString(value, 'caption') ? { caption: readString(value, 'caption') } : {}),
    ...(readString(value, 'role') ? { role: readString(value, 'role') } : {}),
  };
}

function normalizeSectionLayout(value: unknown): CompositeSection['layout'] | undefined {
  return value === 'inline' || value === 'grid' || value === 'table-row' ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function projectExtensions(value: unknown): { readonly extensions?: ArtifactExtensionMap } {
  const extensions = normalizeArtifactExtensionMap(value);
  return extensions ? { extensions } : {};
}

function mergeExtensions(first: unknown, second: unknown): ArtifactExtensionMap | undefined {
  const normalizedFirst = normalizeArtifactExtensionMap(first);
  const normalizedSecond = normalizeArtifactExtensionMap(second);
  if (!normalizedFirst) return normalizedSecond;
  if (!normalizedSecond) return normalizedFirst;
  return { ...normalizedFirst, ...normalizedSecond };
}

function normalizeArtifactExtensionMap(value: unknown): ArtifactExtensionMap | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<`neko.${string}`, ArtifactJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isArtifactExtensionKey(key) || !isArtifactJsonValue(entry)) continue;
    result[key] = entry;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function isArtifactExtensionKey(value: string): value is `neko.${string}` {
  return value.startsWith('neko.');
}

function isArtifactJsonValue(value: unknown): value is ArtifactJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isArtifactJsonValue);
  }
  if (!isRecord(value)) return false;
  return Object.values(value).every(isArtifactJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
