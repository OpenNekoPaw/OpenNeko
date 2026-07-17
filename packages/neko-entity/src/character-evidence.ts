/** Character-domain evidence selection and projection. */
import * as path from 'node:path';
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityOccurrenceRef,
  NekoStoryScriptIndex,
  NpcProfileFact,
  NpcTranscriptMessage,
  ProjectIndexFreshness,
  ProjectSearchItem,
} from '@neko/shared';

export type CharacterEvidenceMode =
  'character-dialogue' | 'embody-character' | 'character-validation';

export type CharacterEvidenceSourceKind =
  'dashboard-detail' | 'entity-occurrence' | 'story-script-index' | 'project-search' | 'manual';

export type CharacterEvidenceAuthority = 'confirmed' | 'suggested' | 'indexed';

export type CharacterEvidenceOmissionReason =
  | 'budget'
  | 'duplicate'
  | 'empty'
  | 'malformed-source'
  | 'missing-source'
  | 'safety'
  | 'stale'
  | 'unsupported-source'
  | 'unavailable';

export type CharacterEvidenceMetadataValue = string | number | boolean | null;

export type CharacterEvidenceMetadata = Readonly<Record<string, CharacterEvidenceMetadataValue>>;

export interface CharacterEvidenceBudget {
  readonly maxChunks: number;
  readonly maxCharacters: number;
  readonly perChunkMaxCharacters: number;
  readonly maxTokens?: number;
  readonly charsPerToken?: number;
  readonly minScore?: number;
}

export interface CharacterEvidenceSourceRef {
  readonly id: string;
  readonly kind: CharacterEvidenceSourceKind;
  readonly label?: string;
  readonly providerId?: string;
  readonly location?: string;
  readonly projectRelativePath?: string;
  readonly filePath?: string;
  readonly uri?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly freshness?: ProjectIndexFreshness;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceRelevanceSignal {
  readonly name: string;
  readonly weight: number;
  readonly matched?: readonly string[];
}

export interface CharacterEvidenceRelevance {
  readonly score: number;
  readonly signals: readonly CharacterEvidenceRelevanceSignal[];
}

export interface CharacterEvidenceChunk {
  readonly id: string;
  readonly text: string;
  readonly sourceRefs: readonly CharacterEvidenceSourceRef[];
  readonly authority: CharacterEvidenceAuthority;
  readonly relevance: CharacterEvidenceRelevance;
  readonly freshness: ProjectIndexFreshness;
  readonly knowledgeBoundary?: string;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceOmission {
  readonly reason: CharacterEvidenceOmissionReason;
  readonly sourceRef?: CharacterEvidenceSourceRef;
  readonly chunkId?: string;
  readonly message: string;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceRequest {
  readonly entityRef: CreativeEntityRef;
  readonly mode: CharacterEvidenceMode;
  readonly query: string;
  readonly projectRoot: string;
  readonly budget: CharacterEvidenceBudget;
  readonly transcript?: readonly NpcTranscriptMessage[];
  readonly seedSourceRefs?: readonly CharacterEvidenceSourceRef[];
}

export interface CharacterEvidenceBundle {
  readonly entityRef: CreativeEntityRef;
  readonly mode: CharacterEvidenceMode;
  readonly query: string;
  readonly chunks: readonly CharacterEvidenceChunk[];
  readonly omitted: readonly CharacterEvidenceOmission[];
  readonly freshness: ProjectIndexFreshness;
  readonly budget: CharacterEvidenceBudget;
}

export interface CharacterEvidenceLoader {
  loadEvidence(request: CharacterEvidenceRequest): Promise<CharacterEvidenceBundle>;
}

export interface CharacterEvidenceScoreInput {
  readonly chunk: Omit<CharacterEvidenceChunk, 'relevance'> & {
    readonly relevance?: CharacterEvidenceRelevance;
  };
  readonly queryTokens: readonly string[];
  readonly entityTokens?: readonly string[];
  readonly transcriptTokens?: readonly string[];
}

export interface CharacterEvidenceTrimResult {
  readonly chunks: readonly CharacterEvidenceChunk[];
  readonly omitted: readonly CharacterEvidenceOmission[];
}

export interface CharacterEvidenceDashboardDetailReader {
  listDetails(entityRef: CreativeEntityRef): Promise<readonly DashboardCreativeEntityDetail[]>;
}

export interface CharacterEvidenceOccurrenceReader {
  listOccurrences(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityOccurrenceProjection[]>;
}

export interface CharacterEvidenceProjectSearchInput {
  readonly projectRoot: string;
  readonly query: string;
  readonly entityRef: CreativeEntityRef;
  readonly limit: number;
}

export interface CharacterEvidenceProjectSearchReader {
  search(input: CharacterEvidenceProjectSearchInput): Promise<readonly ProjectSearchItem[]>;
}

export interface CharacterEvidenceStoryIndexReader {
  getScriptIndex(filePath: string): Promise<NekoStoryScriptIndex | undefined>;
}

export interface CharacterEvidenceTextReader {
  readTextFile(filePath: string): Promise<string>;
}

export interface CharacterEvidenceRuntimeLogger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  warn?(message: string, metadata?: Record<string, unknown>): void;
}

export interface CharacterEvidenceStrategyOptions {
  readonly projectRoot: string;
  readonly dashboardReader?: CharacterEvidenceDashboardDetailReader;
  readonly occurrenceReader?: CharacterEvidenceOccurrenceReader;
  readonly projectSearchReader?: CharacterEvidenceProjectSearchReader;
  readonly storyIndexReader?: CharacterEvidenceStoryIndexReader;
  readonly textReader: CharacterEvidenceTextReader;
  readonly maxWindowLines?: number;
  readonly maxLocators?: number;
  readonly supportedExtensions?: readonly string[];
  readonly logger?: CharacterEvidenceRuntimeLogger;
}

export interface CharacterEvidenceResolvedProjectPath {
  readonly filePath: string;
  readonly projectRelativePath: string;
}

export interface CharacterEvidencePathResolutionInput {
  readonly projectRoot: string;
  readonly candidatePath: string;
  readonly allowAbsolutePath: boolean;
  readonly supportedExtensions?: readonly string[];
}

export interface ParsedCharacterEvidenceLocation {
  readonly candidatePath: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

export interface CharacterEvidenceLocator {
  readonly id: string;
  readonly sourceKind: CharacterEvidenceSourceKind;
  readonly label?: string;
  readonly providerId?: string;
  readonly rawLocation?: string;
  readonly candidatePath?: string;
  readonly allowAbsolutePath: boolean;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly authority: CharacterEvidenceAuthority;
  readonly freshness: ProjectIndexFreshness;
  readonly metadata?: CharacterEvidenceMetadata;
}

export interface CharacterEvidenceLineRange {
  readonly startLine: number;
  readonly endLine: number;
  readonly capped: boolean;
}

export const DEFAULT_CHARACTER_EVIDENCE_BUDGET: CharacterEvidenceBudget = {
  maxChunks: 8,
  maxCharacters: 12000,
  perChunkMaxCharacters: 3000,
  maxTokens: 3000,
  charsPerToken: 4,
  minScore: 0,
};

export const DEFAULT_CHARACTER_EVIDENCE_MAX_WINDOW_LINES = 120;
export const DEFAULT_CHARACTER_EVIDENCE_MAX_LOCATORS = 96;
export const DEFAULT_CHARACTER_EVIDENCE_PROJECT_SEARCH_LIMIT = 24;
export const DEFAULT_CHARACTER_EVIDENCE_SUPPORTED_EXTENSIONS = [
  '.fountain',
  '.spmd',
  '.md',
  '.txt',
  '.nekostory',
] as const;

const FRESHNESS_SCORE: Readonly<Record<ProjectIndexFreshness, number>> = {
  fresh: 3,
  partial: 1,
  building: 0,
  stale: -1,
  failed: -4,
};

const AUTHORITY_SCORE: Readonly<Record<CharacterEvidenceAuthority, number>> = {
  confirmed: 3,
  indexed: 2,
  suggested: 1,
};

export function createCharacterEvidenceStrategy(
  options: CharacterEvidenceStrategyOptions,
): CharacterEvidenceLoader {
  const strategy = new CharacterEvidenceStrategy(options);
  return {
    loadEvidence: (request) => strategy.loadEvidence(request),
  };
}

export function resolveCharacterEvidenceProjectPath(
  input: CharacterEvidencePathResolutionInput,
): CharacterEvidenceResolvedProjectPath | null {
  const candidate = input.candidatePath.trim();
  if (!candidate) return null;
  if (/^[a-z]+:\/\//i.test(candidate)) return null;

  const supportedExtensions =
    input.supportedExtensions ?? DEFAULT_CHARACTER_EVIDENCE_SUPPORTED_EXTENSIONS;
  const rawPath = stripLocationSuffix(candidate);
  if (!isSupportedCharacterEvidencePath(rawPath, supportedExtensions)) {
    return null;
  }

  if (path.isAbsolute(rawPath) && !input.allowAbsolutePath) {
    return null;
  }

  const filePath = path.normalize(
    path.isAbsolute(rawPath) ? rawPath : path.join(input.projectRoot, rawPath),
  );
  if (!isPathInsideProject(input.projectRoot, filePath)) {
    return null;
  }

  return {
    filePath,
    projectRelativePath: normalizeProjectRelativePath(path.relative(input.projectRoot, filePath)),
  };
}

export function parseCharacterEvidenceLocation(
  location: string,
): ParsedCharacterEvidenceLocation | null {
  const trimmed = location.trim();
  if (!trimmed) return null;

  const rangeMatch = /^(.*?):(\d+)(?:-(\d+))?(?::\d+)?$/.exec(trimmed);
  if (!rangeMatch) return { candidatePath: trimmed };

  const candidatePath = rangeMatch[1]?.trim();
  const lineStart = readPositiveInteger(rangeMatch[2]);
  const lineEnd = readPositiveInteger(rangeMatch[3]) ?? lineStart;
  if (!candidatePath || lineStart === undefined) {
    return null;
  }

  return {
    candidatePath,
    lineStart,
    lineEnd: lineEnd !== undefined && lineEnd >= lineStart ? lineEnd : lineStart,
  };
}

class CharacterEvidenceStrategy implements CharacterEvidenceLoader {
  private readonly projectRoot: string;
  private readonly dashboardReader: CharacterEvidenceDashboardDetailReader | undefined;
  private readonly occurrenceReader: CharacterEvidenceOccurrenceReader | undefined;
  private readonly projectSearchReader: CharacterEvidenceProjectSearchReader | undefined;
  private readonly storyIndexReader: CharacterEvidenceStoryIndexReader | undefined;
  private readonly textReader: CharacterEvidenceTextReader;
  private readonly maxWindowLines: number;
  private readonly maxLocators: number;
  private readonly supportedExtensions: readonly string[];
  private readonly logger: CharacterEvidenceRuntimeLogger | undefined;

  constructor(options: CharacterEvidenceStrategyOptions) {
    this.projectRoot = options.projectRoot;
    this.dashboardReader = options.dashboardReader;
    this.occurrenceReader = options.occurrenceReader;
    this.projectSearchReader = options.projectSearchReader;
    this.storyIndexReader = options.storyIndexReader;
    this.textReader = options.textReader;
    this.maxWindowLines = options.maxWindowLines ?? DEFAULT_CHARACTER_EVIDENCE_MAX_WINDOW_LINES;
    this.maxLocators = options.maxLocators ?? DEFAULT_CHARACTER_EVIDENCE_MAX_LOCATORS;
    this.supportedExtensions =
      options.supportedExtensions ?? DEFAULT_CHARACTER_EVIDENCE_SUPPORTED_EXTENSIONS;
    this.logger = options.logger;
  }

  async loadEvidence(request: CharacterEvidenceRequest): Promise<CharacterEvidenceBundle> {
    const budget = normalizeCharacterEvidenceBudget(request.budget);
    const omitted: CharacterEvidenceOmission[] = [];
    const entityRef = normalizeEntityRefProjectRoot(request.entityRef, request.projectRoot);
    const details = await this.loadDashboardDetails(entityRef, omitted);
    const profileTokens = collectProfileTokens(entityRef, details);
    const locators = await this.collectLocators({
      request: { ...request, entityRef },
      details,
      profileTokens,
      omitted,
    });
    const chunks = await this.loadChunks({
      request: { ...request, entityRef, budget },
      locators,
      profileTokens,
      omitted,
    });
    const deduped = dedupeCharacterEvidenceChunks(chunks);
    const trimmed = trimCharacterEvidenceChunks({ chunks: deduped, budget });
    const allOmitted = [...omitted, ...trimmed.omitted];
    const freshness = aggregateCharacterEvidenceFreshness([
      ...trimmed.chunks.map((chunk) => chunk.freshness),
      ...locators.map((locator) => locator.freshness),
    ]);

    return {
      entityRef,
      mode: request.mode,
      query: request.query,
      chunks: trimmed.chunks,
      omitted: allOmitted,
      freshness,
      budget,
    };
  }

  private async loadDashboardDetails(
    entityRef: CreativeEntityRef,
    omitted: CharacterEvidenceOmission[],
  ): Promise<readonly DashboardCreativeEntityDetail[]> {
    if (!this.dashboardReader) return [];
    try {
      return await this.dashboardReader.listDetails(entityRef);
    } catch (error) {
      omitted.push({
        reason: 'unavailable',
        message: `Dashboard detail evidence is unavailable: ${formatUnknownError(error)}`,
      });
      return [];
    }
  }

  private async collectLocators(input: {
    readonly request: CharacterEvidenceRequest;
    readonly details: readonly DashboardCreativeEntityDetail[];
    readonly profileTokens: readonly string[];
    readonly omitted: CharacterEvidenceOmission[];
  }): Promise<readonly CharacterEvidenceLocator[]> {
    const locators: CharacterEvidenceLocator[] = [
      ...(input.request.seedSourceRefs ?? []).flatMap(sourceRefToLocator),
      ...input.details.flatMap((detail) => dashboardDetailToLocators(detail)),
    ];

    if (this.occurrenceReader) {
      try {
        locators.push(
          ...(await this.occurrenceReader.listOccurrences(input.request.entityRef)).flatMap(
            occurrenceProjectionToLocator,
          ),
        );
      } catch (error) {
        input.omitted.push({
          reason: 'unavailable',
          message: `Entity occurrence evidence is unavailable: ${formatUnknownError(error)}`,
        });
      }
    }

    locators.push(...(await this.collectProjectSearchLocators(input)));
    locators.push(...(await this.collectStorySceneLocators(locators, input.profileTokens)));

    const deduped = dedupeCharacterEvidenceLocators(locators).slice(0, this.maxLocators);
    for (const locator of deduped) {
      if (locator.freshness === 'fresh' || locator.freshness === 'partial') continue;
      input.omitted.push({
        reason: 'stale',
        sourceRef: locatorToSourceRef(locator),
        message: `Evidence locator freshness is ${locator.freshness}; using available fallback evidence only when it can be read safely.`,
      });
    }
    return deduped;
  }

  private async collectProjectSearchLocators(input: {
    readonly request: CharacterEvidenceRequest;
    readonly details: readonly DashboardCreativeEntityDetail[];
    readonly omitted: CharacterEvidenceOmission[];
  }): Promise<readonly CharacterEvidenceLocator[]> {
    if (!this.projectSearchReader) return [];
    const searchQuery = buildEvidenceSearchQuery(input.request, input.details);
    if (!searchQuery) return [];

    try {
      const items = await this.projectSearchReader.search({
        projectRoot: input.request.projectRoot,
        query: searchQuery,
        entityRef: input.request.entityRef,
        limit: DEFAULT_CHARACTER_EVIDENCE_PROJECT_SEARCH_LIMIT,
      });
      return items.flatMap(projectSearchItemToLocator);
    } catch (error) {
      input.omitted.push({
        reason: 'unavailable',
        message: `Project search evidence locators are unavailable: ${formatUnknownError(error)}`,
      });
      return [];
    }
  }

  private async collectStorySceneLocators(
    locators: readonly CharacterEvidenceLocator[],
    profileTokens: readonly string[],
  ): Promise<readonly CharacterEvidenceLocator[]> {
    if (!this.storyIndexReader) return [];
    const byFile = new Map<string, CharacterEvidenceLocator[]>();
    for (const locator of locators) {
      const candidatePath = locator.candidatePath ?? parseCandidatePath(locator.rawLocation);
      if (!candidatePath) continue;
      const resolved = resolveCharacterEvidenceProjectPath({
        projectRoot: this.projectRoot,
        candidatePath,
        allowAbsolutePath: locator.allowAbsolutePath,
        supportedExtensions: this.supportedExtensions,
      });
      if (!resolved) continue;
      const existing = byFile.get(resolved.filePath) ?? [];
      byFile.set(resolved.filePath, [...existing, locator]);
    }

    const sceneLocators: CharacterEvidenceLocator[] = [];
    for (const [filePath, fileLocators] of byFile) {
      const index = await this.safeGetScriptIndex(filePath);
      if (!index) continue;
      const matchedScenes = new Set<string>();
      for (const locator of fileLocators) {
        const scene = findSceneForLocator(index, locator, profileTokens);
        if (!scene || matchedScenes.has(scene.sceneId)) continue;
        matchedScenes.add(scene.sceneId);
        sceneLocators.push({
          id: `story-scene:${filePath}:${scene.sceneId}`,
          sourceKind: 'story-script-index',
          label: scene.heading || scene.sceneTitle,
          providerId: 'neko-story',
          candidatePath: filePath,
          allowAbsolutePath: true,
          lineStart: scene.line_start + 1,
          lineEnd: scene.line_end + 1,
          authority: 'indexed',
          freshness: 'fresh',
          metadata: {
            sceneId: scene.sceneId,
            source: 'script-index',
          },
        });
      }
    }

    return sceneLocators;
  }

  private async safeGetScriptIndex(filePath: string): Promise<NekoStoryScriptIndex | undefined> {
    try {
      return await this.storyIndexReader?.getScriptIndex(filePath);
    } catch (error) {
      this.logger?.debug('Character evidence Story index unavailable', {
        filePath,
        error: formatUnknownError(error),
      });
      return undefined;
    }
  }

  private async loadChunks(input: {
    readonly request: CharacterEvidenceRequest;
    readonly locators: readonly CharacterEvidenceLocator[];
    readonly profileTokens: readonly string[];
    readonly omitted: CharacterEvidenceOmission[];
  }): Promise<readonly CharacterEvidenceChunk[]> {
    const chunks: CharacterEvidenceChunk[] = [];
    const transcriptTokens = normalizeCharacterEvidenceTokens(
      (input.request.transcript ?? [])
        .slice(-6)
        .map((message) => message.content)
        .join(' '),
    );
    const queryTokens = normalizeCharacterEvidenceTokens(input.request.query);

    for (const locator of input.locators) {
      const resolved = this.resolveLocatorPath(locator, input.omitted);
      if (!resolved) continue;

      const text = await this.safeReadText(resolved, locator, input.omitted);
      if (text === undefined) continue;

      const lines = text.split(/\r?\n/);
      if (lines.length === 0) {
        input.omitted.push({
          reason: 'empty',
          sourceRef: locatorToSourceRef(locator, resolved),
          message: `Evidence source is empty: ${resolved.projectRelativePath}`,
        });
        continue;
      }

      const range = resolveCharacterEvidenceLineRange(locator, lines.length, this.maxWindowLines);
      const chunkText = renderEvidenceChunkText({
        relativePath: resolved.projectRelativePath,
        label: locator.label,
        range,
        lines,
      });
      if (!chunkText.trim()) {
        input.omitted.push({
          reason: 'empty',
          sourceRef: locatorToSourceRef(locator, resolved),
          message: `Evidence range is empty: ${resolved.projectRelativePath}`,
        });
        continue;
      }

      if (range.capped) {
        input.omitted.push({
          reason: 'budget',
          sourceRef: locatorToSourceRef(locator, resolved, range),
          message: `Evidence range was capped to ${this.maxWindowLines} lines.`,
        });
      }

      const sourceRef = locatorToSourceRef(locator, resolved, range);
      const chunkWithoutRelevance = {
        id: characterEvidenceChunkId(sourceRef),
        text: chunkText,
        sourceRefs: [sourceRef],
        authority: locator.authority,
        freshness: locator.freshness,
        metadata: locator.metadata,
      };
      const chunk: CharacterEvidenceChunk = {
        ...chunkWithoutRelevance,
        relevance: scoreCharacterEvidenceChunk({
          chunk: chunkWithoutRelevance,
          queryTokens,
          entityTokens: input.profileTokens,
          transcriptTokens,
        }),
      };
      chunks.push(chunk);
    }

    return chunks;
  }

  private resolveLocatorPath(
    locator: CharacterEvidenceLocator,
    omitted: CharacterEvidenceOmission[],
  ): CharacterEvidenceResolvedProjectPath | null {
    const candidatePath = locator.candidatePath ?? parseCandidatePath(locator.rawLocation);
    if (!candidatePath) {
      omitted.push({
        reason: 'malformed-source',
        sourceRef: locatorToSourceRef(locator),
        message: `Evidence locator is missing a readable path: ${locator.rawLocation ?? locator.id}`,
      });
      return null;
    }

    const resolved = resolveCharacterEvidenceProjectPath({
      projectRoot: this.projectRoot,
      candidatePath,
      allowAbsolutePath: locator.allowAbsolutePath,
      supportedExtensions: this.supportedExtensions,
    });
    if (!resolved) {
      const sourcePath = stripLocationSuffix(candidatePath);
      omitted.push({
        reason: isSupportedCharacterEvidencePath(sourcePath, this.supportedExtensions)
          ? 'safety'
          : 'unsupported-source',
        sourceRef: locatorToSourceRef(locator),
        message: `Evidence source is outside project scope or unsupported: ${candidatePath}`,
      });
      return null;
    }
    return resolved;
  }

  private async safeReadText(
    resolved: CharacterEvidenceResolvedProjectPath,
    locator: CharacterEvidenceLocator,
    omitted: CharacterEvidenceOmission[],
  ): Promise<string | undefined> {
    try {
      return await this.textReader.readTextFile(resolved.filePath);
    } catch (error) {
      omitted.push({
        reason: 'missing-source',
        sourceRef: locatorToSourceRef(locator, resolved),
        message: `Evidence source could not be read: ${resolved.projectRelativePath}`,
        metadata: { error: formatUnknownError(error) },
      });
      return undefined;
    }
  }
}

export function normalizeCharacterEvidenceTokens(
  input: string | readonly string[],
): readonly string[] {
  const raw = typeof input === 'string' ? input : input.join(' ');
  const normalized = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim();
  if (!normalized) return [];
  return dedupeStrings(normalized.split(/\s+/).filter((token) => token.length > 0));
}

export function scoreCharacterEvidenceChunk(
  input: CharacterEvidenceScoreInput,
): CharacterEvidenceRelevance {
  const textTokens = new Set(normalizeCharacterEvidenceTokens(input.chunk.text));
  const signals: CharacterEvidenceRelevanceSignal[] = [];
  let score = 0;

  const queryMatches = input.queryTokens.filter((token) => textTokens.has(token));
  if (queryMatches.length > 0) {
    const weight = queryMatches.length * 5;
    score += weight;
    signals.push({ name: 'query-token-match', weight, matched: queryMatches });
  }

  const entityMatches = (input.entityTokens ?? []).filter((token) => textTokens.has(token));
  if (entityMatches.length > 0) {
    const weight = entityMatches.length * 3;
    score += weight;
    signals.push({ name: 'entity-token-match', weight, matched: entityMatches });
  }

  const transcriptMatches = (input.transcriptTokens ?? []).filter((token) => textTokens.has(token));
  if (transcriptMatches.length > 0) {
    const weight = Math.min(6, transcriptMatches.length * 2);
    score += weight;
    signals.push({ name: 'recent-transcript-match', weight, matched: transcriptMatches });
  }

  const authorityWeight = AUTHORITY_SCORE[input.chunk.authority];
  score += authorityWeight;
  signals.push({ name: 'authority', weight: authorityWeight });

  const freshnessWeight = FRESHNESS_SCORE[input.chunk.freshness];
  score += freshnessWeight;
  signals.push({ name: 'freshness', weight: freshnessWeight });

  return { score, signals };
}

export function rankCharacterEvidenceChunks(
  chunks: readonly CharacterEvidenceChunk[],
): readonly CharacterEvidenceChunk[] {
  return [...chunks].sort((left, right) => {
    const scoreDelta = right.relevance.score - left.relevance.score;
    if (scoreDelta !== 0) return scoreDelta;
    const leftLine = firstSourceLine(left);
    const rightLine = firstSourceLine(right);
    if (leftLine !== rightLine) return leftLine - rightLine;
    return stableChunkSortKey(left).localeCompare(stableChunkSortKey(right));
  });
}

export function dedupeCharacterEvidenceChunks(
  chunks: readonly CharacterEvidenceChunk[],
): readonly CharacterEvidenceChunk[] {
  const byKey = new Map<string, CharacterEvidenceChunk>();
  const order: string[] = [];

  for (const chunk of chunks) {
    const key = characterEvidenceDedupeKey(chunk);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, chunk);
      order.push(key);
      continue;
    }

    byKey.set(key, mergeCharacterEvidenceChunks(existing, chunk));
  }

  return order
    .map((key) => byKey.get(key))
    .filter((chunk): chunk is CharacterEvidenceChunk => !!chunk);
}

export function trimCharacterEvidenceChunks(input: {
  readonly chunks: readonly CharacterEvidenceChunk[];
  readonly budget: CharacterEvidenceBudget;
}): CharacterEvidenceTrimResult {
  const budget = normalizeBudget(input.budget);
  const minScore = budget.minScore ?? 0;
  const charsPerToken = budget.charsPerToken ?? 4;
  const ranked = rankCharacterEvidenceChunks(input.chunks).filter(
    (chunk) => chunk.relevance.score >= minScore,
  );
  const chunks: CharacterEvidenceChunk[] = [];
  const omitted: CharacterEvidenceOmission[] = [];
  let usedCharacters = 0;

  for (const chunk of ranked) {
    if (chunks.length >= budget.maxChunks) {
      omitted.push(createBudgetOmission(chunk, 'Chunk limit reached.'));
      continue;
    }

    const remainingCharacters = budget.maxCharacters - usedCharacters;
    const remainingTokenCharacters =
      budget.maxTokens !== undefined
        ? budget.maxTokens * charsPerToken - usedCharacters
        : remainingCharacters;
    const remaining = Math.min(
      remainingCharacters,
      remainingTokenCharacters,
      budget.perChunkMaxCharacters,
    );

    if (remaining <= 0) {
      omitted.push(createBudgetOmission(chunk, 'Character budget reached.'));
      continue;
    }

    const normalizedChunk =
      chunk.text.length > remaining
        ? {
            ...chunk,
            text: truncateEvidenceText(chunk.text, remaining),
            metadata: {
              ...(chunk.metadata ?? {}),
              truncated: true,
              originalCharacters: chunk.text.length,
            },
          }
        : chunk;

    chunks.push(normalizedChunk);
    usedCharacters += normalizedChunk.text.length;

    if (chunk.text.length > normalizedChunk.text.length) {
      omitted.push(createBudgetOmission(chunk, 'Chunk was truncated to fit evidence budget.'));
    }
  }

  const filtered = input.chunks.filter((chunk) => chunk.relevance.score < minScore);
  for (const chunk of filtered) {
    omitted.push(createBudgetOmission(chunk, 'Chunk was below the minimum relevance score.'));
  }

  return { chunks, omitted };
}

export function renderCharacterEvidenceBundle(
  bundle: CharacterEvidenceBundle,
  options: { readonly locale?: string } = {},
): string {
  const zh = options.locale?.trim().toLowerCase().startsWith('zh') === true;
  const lines = [
    zh ? '本回合项目证据:' : 'Turn-scoped project evidence:',
    `${zh ? '模式' : 'Mode'}: ${bundle.mode}`,
    `${zh ? '新鲜度' : 'Freshness'}: ${bundle.freshness}`,
    `${zh ? '已加载片段' : 'Loaded chunks'}: ${bundle.chunks.length}`,
  ];

  if (bundle.chunks.length === 0) {
    lines.push(
      zh
        ? '- 本回合没有加载到相关项目证据。'
        : '- No relevant project evidence was loaded for this turn.',
    );
  }

  bundle.chunks.forEach((chunk, index) => {
    const heading = `[${zh ? '证据' : 'Evidence'} ${index + 1}]`;
    const metadata = [
      `score=${chunk.relevance.score}`,
      `authority=${chunk.authority}`,
      `freshness=${chunk.freshness}`,
    ].join(' ');
    lines.push(
      '',
      `${heading} ${metadata}`,
      `${zh ? '来源' : 'Source'}: ${formatPrimarySource(chunk.sourceRefs[0])}`,
      zh ? localizeCharacterEvidenceChunkTextForPrompt(chunk.text) : chunk.text,
    );
  });

  if (bundle.omitted.length > 0) {
    lines.push('', zh ? '已省略证据:' : 'Omitted evidence:');
    for (const omission of bundle.omitted.slice(0, 12)) {
      const message = zh
        ? localizeCharacterEvidenceOmissionMessage(omission.message)
        : omission.message;
      lines.push(`- ${omission.reason}: ${message}`);
    }
  }

  return lines.join('\n');
}

function localizeCharacterEvidenceChunkTextForPrompt(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('Script file:')) {
        return line.replace(/^Script file:/, '剧本文件:');
      }
      if (line.startsWith('Lines:')) {
        return line.replace(/^Lines:/, '行:');
      }
      if (line === 'Evidence:') {
        return '证据:';
      }
      return line;
    })
    .join('\n');
}

function localizeCharacterEvidenceOmissionMessage(message: string): string {
  switch (message) {
    case 'Chunk was truncated to fit evidence budget.':
      return '证据片段已截断以适配证据预算。';
    case 'Chunk was below the minimum relevance score.':
      return '证据片段低于最低相关性分数。';
    default:
      return message;
  }
}

export function projectCharacterEvidenceBundleToProfileFacts(
  bundle: CharacterEvidenceBundle,
): readonly NpcProfileFact[] {
  return bundle.chunks.map((chunk, index) => ({
    key: `script.context.${index + 1}`,
    value: chunk.text,
    source: 'script-extraction',
    authority: chunk.authority === 'suggested' ? 'suggested' : 'confirmed',
    sourceRef: formatPrimarySource(chunk.sourceRefs[0]),
    providerId: chunk.sourceRefs[0]?.providerId ?? chunk.sourceRefs[0]?.kind,
    metadata: {
      evidenceChunkId: chunk.id,
      relevanceScore: chunk.relevance.score,
      freshness: chunk.freshness,
    },
  }));
}

export function aggregateCharacterEvidenceFreshness(
  freshnessValues: readonly ProjectIndexFreshness[],
): ProjectIndexFreshness {
  if (freshnessValues.length === 0) return 'failed';
  if (freshnessValues.includes('failed')) return 'partial';
  if (freshnessValues.includes('building')) return 'building';
  if (freshnessValues.includes('stale')) return 'stale';
  if (freshnessValues.includes('partial')) return 'partial';
  return 'fresh';
}

export function normalizeCharacterEvidenceBudget(
  budget: Partial<CharacterEvidenceBudget> = {},
): CharacterEvidenceBudget {
  return normalizeBudget({ ...DEFAULT_CHARACTER_EVIDENCE_BUDGET, ...budget });
}

export function dashboardDetailToCharacterEvidenceLocators(
  detail: DashboardCreativeEntityDetail,
): readonly CharacterEvidenceLocator[] {
  return dashboardDetailToLocators(detail);
}

export function occurrenceProjectionToCharacterEvidenceLocators(
  occurrence: CreativeEntityOccurrenceProjection,
): readonly CharacterEvidenceLocator[] {
  return occurrenceProjectionToLocator(occurrence);
}

export function projectSearchItemToCharacterEvidenceLocators(
  item: ProjectSearchItem,
): readonly CharacterEvidenceLocator[] {
  return projectSearchItemToLocator(item);
}

export function sourceRefToCharacterEvidenceLocators(
  sourceRef: CharacterEvidenceSourceRef,
): readonly CharacterEvidenceLocator[] {
  return sourceRefToLocator(sourceRef);
}

export function resolveCharacterEvidenceLineRange(
  locator: Pick<CharacterEvidenceLocator, 'lineStart' | 'lineEnd'>,
  totalLines: number,
  maxWindowLines: number,
): CharacterEvidenceLineRange {
  const cappedWindow = Math.max(1, maxWindowLines);
  const requestedStart = clampLine(locator.lineStart ?? 1, totalLines);
  const requestedEnd = clampLine(locator.lineEnd ?? requestedStart, totalLines);
  const startLine = Math.min(requestedStart, requestedEnd);
  let endLine = Math.max(requestedStart, requestedEnd);

  if (locator.lineEnd === undefined && locator.lineStart !== undefined) {
    const halfWindow = Math.floor(cappedWindow / 2);
    const start = Math.max(1, locator.lineStart - halfWindow);
    const end = Math.min(totalLines, start + cappedWindow - 1);
    return {
      startLine: start,
      endLine: end,
      capped:
        end - start + 1 < Math.min(totalLines, cappedWindow) ? false : totalLines > cappedWindow,
    };
  }

  const requestedCount = endLine - startLine + 1;
  if (requestedCount > cappedWindow) {
    endLine = startLine + cappedWindow - 1;
    return { startLine, endLine, capped: true };
  }

  return { startLine, endLine, capped: false };
}

export function renderCharacterEvidenceChunkText(input: {
  readonly relativePath: string;
  readonly label?: string;
  readonly range: CharacterEvidenceLineRange;
  readonly lines: readonly string[];
}): string {
  return renderEvidenceChunkText(input);
}

export function characterEvidenceLocatorToSourceRef(
  locator: CharacterEvidenceLocator,
  resolved?: CharacterEvidenceResolvedProjectPath,
  range?: CharacterEvidenceLineRange,
): CharacterEvidenceSourceRef {
  return locatorToSourceRef(locator, resolved, range);
}

export function dedupeCharacterEvidenceLocators(
  locators: readonly CharacterEvidenceLocator[],
): readonly CharacterEvidenceLocator[] {
  const seen = new Set<string>();
  const deduped: CharacterEvidenceLocator[] = [];
  for (const locator of locators) {
    const key = [
      locator.sourceKind,
      locator.candidatePath ?? locator.rawLocation ?? locator.id,
      locator.lineStart ?? '',
      locator.lineEnd ?? '',
      locator.label ?? '',
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(locator);
  }
  return deduped;
}

function dashboardDetailToLocators(
  detail: DashboardCreativeEntityDetail,
): readonly CharacterEvidenceLocator[] {
  return detail.occurrences.flatMap((occurrence) => {
    if (occurrence.source !== 'script') return [];
    return dashboardOccurrenceToLocator(detail, occurrence);
  });
}

function dashboardOccurrenceToLocator(
  detail: DashboardCreativeEntityDetail,
  occurrence: DashboardCreativeEntityOccurrenceRef,
): readonly CharacterEvidenceLocator[] {
  const parsed = parseCharacterEvidenceLocation(occurrence.location);
  if (!parsed) {
    return [
      {
        id: `dashboard:${detail.ref.source}:${occurrence.location}`,
        sourceKind: 'dashboard-detail',
        label: occurrence.label,
        providerId: detail.ref.source,
        rawLocation: occurrence.location,
        allowAbsolutePath: false,
        authority: 'confirmed',
        freshness: detail.freshness,
        metadata: {
          occurrenceRole: occurrence.role,
          dashboardSource: detail.ref.source,
        },
      },
    ];
  }

  return [
    {
      id: `dashboard:${detail.ref.source}:${occurrence.location}`,
      sourceKind: 'dashboard-detail',
      label: occurrence.label,
      providerId: detail.ref.source,
      rawLocation: occurrence.location,
      candidatePath: parsed.candidatePath,
      allowAbsolutePath: false,
      lineStart: parsed.lineStart,
      lineEnd: parsed.lineEnd,
      authority: 'confirmed',
      freshness: detail.freshness,
      metadata: {
        occurrenceRole: occurrence.role,
        dashboardSource: detail.ref.source,
      },
    },
  ];
}

function occurrenceProjectionToLocator(
  occurrence: CreativeEntityOccurrenceProjection,
): readonly CharacterEvidenceLocator[] {
  const parsed = parseCharacterEvidenceLocation(occurrence.source.sourceRef ?? occurrence.location);
  return [
    {
      id: `occurrence:${occurrence.source.providerId ?? occurrence.source.sourceId}:${occurrence.location}`,
      sourceKind: 'entity-occurrence',
      label: occurrence.label,
      providerId: occurrence.source.providerId ?? occurrence.source.sourceId,
      rawLocation: occurrence.source.sourceRef ?? occurrence.location,
      ...(parsed ? { candidatePath: parsed.candidatePath } : {}),
      allowAbsolutePath: false,
      ...(parsed?.lineStart !== undefined ? { lineStart: parsed.lineStart } : {}),
      ...(parsed?.lineEnd !== undefined ? { lineEnd: parsed.lineEnd } : {}),
      authority: occurrence.source.sourceKind === 'story' ? 'confirmed' : 'indexed',
      freshness: occurrence.source.freshness ?? 'fresh',
      metadata: {
        occurrenceRole: occurrence.role,
        sourceKind: occurrence.source.sourceKind,
      },
    },
  ];
}

function projectSearchItemToLocator(item: ProjectSearchItem): readonly CharacterEvidenceLocator[] {
  const candidatePath =
    readString(item.navigationData?.['filePath']) ??
    item.source.projectRelativePath ??
    item.source.filePath ??
    item.filePath;
  if (!candidatePath) return [];

  const lineStart =
    readLineFromProjectSearchItem(item, 'lineStart') ?? readLineFromProjectSearchItem(item, 'line');
  const lineEnd = readLineFromProjectSearchItem(item, 'lineEnd') ?? lineStart;

  return [
    {
      id: `project-search:${item.id}`,
      sourceKind: 'project-search',
      label: item.label,
      providerId: item.source.sourceId ?? item.source.partition,
      candidatePath,
      allowAbsolutePath: true,
      ...(lineStart !== undefined ? { lineStart } : {}),
      ...(lineEnd !== undefined ? { lineEnd } : {}),
      authority:
        item.kind === 'story-scene' || item.kind === 'script-role' ? 'indexed' : 'suggested',
      freshness: item.freshness,
      metadata: {
        itemKind: item.kind,
        sourcePartition: item.source.partition,
      },
    },
  ];
}

function sourceRefToLocator(
  sourceRef: CharacterEvidenceSourceRef,
): readonly CharacterEvidenceLocator[] {
  const candidatePath = sourceRef.projectRelativePath ?? sourceRef.filePath ?? sourceRef.location;
  if (!candidatePath) return [];
  return [
    {
      id: sourceRef.id,
      sourceKind: sourceRef.kind,
      label: sourceRef.label,
      providerId: sourceRef.providerId,
      rawLocation: sourceRef.location,
      candidatePath,
      allowAbsolutePath: Boolean(sourceRef.filePath),
      lineStart: sourceRef.lineStart,
      lineEnd: sourceRef.lineEnd,
      authority: 'indexed',
      freshness: sourceRef.freshness ?? 'fresh',
      metadata: sourceRef.metadata,
    },
  ];
}

function findSceneForLocator(
  index: NekoStoryScriptIndex,
  locator: CharacterEvidenceLocator,
  profileTokens: readonly string[],
): NekoStoryScriptIndex['scenes'][number] | undefined {
  if (locator.lineStart !== undefined) {
    const zeroBasedLine = Math.max(0, locator.lineStart - 1);
    const lineScene = index.scenes.find(
      (scene) => scene.line_start <= zeroBasedLine && scene.line_end >= zeroBasedLine,
    );
    if (lineScene) return lineScene;
  }

  const tokenSet = new Set(profileTokens);
  return index.scenes.find((scene) =>
    scene.sceneCharacters.some((name) =>
      normalizeCharacterEvidenceTokens(name).some((token) => tokenSet.has(token)),
    ),
  );
}

function renderEvidenceChunkText(input: {
  readonly relativePath: string;
  readonly label?: string;
  readonly range: CharacterEvidenceLineRange;
  readonly lines: readonly string[];
}): string {
  const selected = input.lines.slice(input.range.startLine - 1, input.range.endLine);
  const numbered = selected.map((line, index) => `${input.range.startLine + index}: ${line}`);
  return [
    `Script file: ${input.relativePath}`,
    `Lines: ${input.range.startLine}-${input.range.endLine}`,
    'Evidence:',
    ...numbered,
  ].join('\n');
}

function locatorToSourceRef(
  locator: CharacterEvidenceLocator,
  resolved?: CharacterEvidenceResolvedProjectPath,
  range?: CharacterEvidenceLineRange,
): CharacterEvidenceSourceRef {
  return {
    id: locator.id,
    kind: locator.sourceKind,
    ...(locator.label ? { label: locator.label } : {}),
    ...(locator.providerId ? { providerId: locator.providerId } : {}),
    ...(locator.rawLocation ? { location: locator.rawLocation } : {}),
    ...(resolved?.projectRelativePath ? { projectRelativePath: resolved.projectRelativePath } : {}),
    ...(resolved?.filePath ? { filePath: resolved.filePath } : {}),
    ...(range?.startLine !== undefined ? { lineStart: range.startLine } : {}),
    ...(range?.endLine !== undefined ? { lineEnd: range.endLine } : {}),
    freshness: locator.freshness,
    ...(locator.metadata ? { metadata: locator.metadata } : {}),
  };
}

function characterEvidenceChunkId(sourceRef: CharacterEvidenceSourceRef): string {
  return [
    sourceRef.kind,
    sourceRef.projectRelativePath ?? sourceRef.filePath ?? sourceRef.location ?? sourceRef.id,
    sourceRef.lineStart ?? '',
    sourceRef.lineEnd ?? '',
  ].join(':');
}

function buildEvidenceSearchQuery(
  request: CharacterEvidenceRequest,
  details: readonly DashboardCreativeEntityDetail[],
): string {
  return [
    request.query,
    request.entityRef.entityId,
    ...details.flatMap((detail) => [detail.label, ...detail.aliases]),
  ]
    .filter((value) => value.trim().length > 0)
    .join(' ');
}

function collectProfileTokens(
  entityRef: CreativeEntityRef,
  details: readonly DashboardCreativeEntityDetail[],
): readonly string[] {
  return normalizeCharacterEvidenceTokens([
    entityRef.entityId,
    ...details.flatMap((detail) => [detail.label, ...detail.aliases]),
  ]);
}

function parseCandidatePath(location: string | undefined): string | undefined {
  if (!location) return undefined;
  return parseCharacterEvidenceLocation(location)?.candidatePath;
}

function stripLocationSuffix(candidatePath: string): string {
  const parsed = parseCharacterEvidenceLocation(candidatePath);
  return parsed?.candidatePath ?? candidatePath;
}

function isSupportedCharacterEvidencePath(
  filePath: string,
  supportedExtensions: readonly string[],
): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return supportedExtensions.includes(extension);
}

function isPathInsideProject(projectRoot: string, filePath: string): boolean {
  const relative = path.relative(projectRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeProjectRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function clampLine(line: number, totalLines: number): number {
  return Math.min(Math.max(1, line), Math.max(1, totalLines));
}

function readLineFromProjectSearchItem(
  item: ProjectSearchItem,
  field: 'line' | 'lineStart' | 'lineEnd',
): number | undefined {
  const value = readNumber(item.navigationData?.[field]) ?? readNumber(item.metadata?.[field]);
  if (value === undefined) return undefined;
  return value >= 0 ? Math.floor(value) + 1 : undefined;
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeEntityRefProjectRoot(
  entityRef: CreativeEntityRef,
  projectRoot: string,
): CreativeEntityRef {
  return {
    ...entityRef,
    projectRoot,
  };
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeBudget(budget: CharacterEvidenceBudget): CharacterEvidenceBudget {
  const charsPerToken = Math.max(
    1,
    budget.charsPerToken ?? DEFAULT_CHARACTER_EVIDENCE_BUDGET.charsPerToken ?? 4,
  );
  return {
    maxChunks: Math.max(0, Math.floor(budget.maxChunks)),
    maxCharacters: Math.max(0, Math.floor(budget.maxCharacters)),
    perChunkMaxCharacters: Math.max(0, Math.floor(budget.perChunkMaxCharacters)),
    ...(budget.maxTokens !== undefined
      ? { maxTokens: Math.max(0, Math.floor(budget.maxTokens)) }
      : {}),
    charsPerToken,
    ...(budget.minScore !== undefined ? { minScore: budget.minScore } : { minScore: 0 }),
  };
}

function characterEvidenceDedupeKey(chunk: CharacterEvidenceChunk): string {
  const source = chunk.sourceRefs[0];
  const location = source
    ? [
        source.projectRelativePath ?? source.filePath ?? source.uri ?? source.location ?? source.id,
        source.lineStart ?? '',
        source.lineEnd ?? '',
      ].join(':')
    : chunk.id;
  return `${location}\u0000${stableTextHash(chunk.text)}`;
}

function mergeCharacterEvidenceChunks(
  left: CharacterEvidenceChunk,
  right: CharacterEvidenceChunk,
): CharacterEvidenceChunk {
  const preferred = right.relevance.score > left.relevance.score ? right : left;
  return {
    ...preferred,
    sourceRefs: dedupeSourceRefs([...left.sourceRefs, ...right.sourceRefs]),
    relevance: {
      score: Math.max(left.relevance.score, right.relevance.score),
      signals: dedupeRelevanceSignals([...left.relevance.signals, ...right.relevance.signals]),
    },
    freshness: aggregateCharacterEvidenceFreshness([left.freshness, right.freshness]),
  };
}

function dedupeSourceRefs(
  sourceRefs: readonly CharacterEvidenceSourceRef[],
): readonly CharacterEvidenceSourceRef[] {
  const seen = new Set<string>();
  const result: CharacterEvidenceSourceRef[] = [];
  for (const sourceRef of sourceRefs) {
    const key = [
      sourceRef.kind,
      sourceRef.id,
      sourceRef.projectRelativePath ?? sourceRef.filePath ?? sourceRef.uri ?? '',
      sourceRef.lineStart ?? '',
      sourceRef.lineEnd ?? '',
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sourceRef);
  }
  return result;
}

function dedupeRelevanceSignals(
  signals: readonly CharacterEvidenceRelevanceSignal[],
): readonly CharacterEvidenceRelevanceSignal[] {
  const byName = new Map<string, CharacterEvidenceRelevanceSignal>();
  for (const signal of signals) {
    const existing = byName.get(signal.name);
    if (!existing) {
      byName.set(signal.name, signal);
      continue;
    }
    byName.set(signal.name, {
      name: signal.name,
      weight: Math.max(existing.weight, signal.weight),
      matched: dedupeStrings([...(existing.matched ?? []), ...(signal.matched ?? [])]),
    });
  }
  return [...byName.values()];
}

function createBudgetOmission(
  chunk: CharacterEvidenceChunk,
  message: string,
): CharacterEvidenceOmission {
  return {
    reason: 'budget',
    chunkId: chunk.id,
    sourceRef: chunk.sourceRefs[0],
    message,
    metadata: {
      relevanceScore: chunk.relevance.score,
      characters: chunk.text.length,
    },
  };
}

function truncateEvidenceText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  if (maxCharacters <= 12) return text.slice(0, maxCharacters);
  return `${text.slice(0, maxCharacters - 12).trimEnd()}\n[truncated]`;
}

function firstSourceLine(chunk: CharacterEvidenceChunk): number {
  return chunk.sourceRefs[0]?.lineStart ?? Number.MAX_SAFE_INTEGER;
}

function stableChunkSortKey(chunk: CharacterEvidenceChunk): string {
  const source = chunk.sourceRefs[0];
  return [
    source?.projectRelativePath ?? source?.filePath ?? source?.uri ?? source?.location ?? '',
    source?.lineStart ?? '',
    source?.lineEnd ?? '',
    chunk.id,
  ].join('\u0000');
}

function stableTextHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function formatPrimarySource(sourceRef: CharacterEvidenceSourceRef | undefined): string {
  if (!sourceRef) return 'unknown';
  const location =
    sourceRef.location ??
    (sourceRef.projectRelativePath
      ? `${sourceRef.projectRelativePath}${formatLineRange(sourceRef)}`
      : (sourceRef.uri ?? sourceRef.filePath ?? sourceRef.id));
  return [sourceRef.label, location].filter((value): value is string => Boolean(value)).join(' @ ');
}

function formatLineRange(sourceRef: CharacterEvidenceSourceRef): string {
  if (sourceRef.lineStart === undefined) return '';
  if (sourceRef.lineEnd === undefined || sourceRef.lineEnd === sourceRef.lineStart) {
    return `:${sourceRef.lineStart}`;
  }
  return `:${sourceRef.lineStart}-${sourceRef.lineEnd}`;
}

function dedupeStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
