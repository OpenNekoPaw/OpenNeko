/**
 * Project mention projection for agent @completion.
 *
 * The Agent extension consumes the project cache/search facade instead of
 * owning cache file schemas. Domain-specific cache reads live behind
 * ProjectSearchAdapter implementations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ProjectSearchItem, ProjectSearchItemKind, ProjectSearchResult } from '@neko/shared';
import type { AgentProjectFileSearchPlan, AgentProjectMentionCandidate } from '@neko/agent/runtime';
import type {
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
} from '@neko-agent/types';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';

const MENTION_SEARCH_KINDS: readonly ProjectSearchItemKind[] = [
  'story-scene',
  'story-section',
  'script-role',
  'creative-entity',
  'entity-candidate',
  'media',
  'document',
  'generated-asset',
];

const ROLEPLAY_SEARCH_KINDS: readonly ProjectSearchItemKind[] = [
  'creative-entity',
  'entity-candidate',
];

const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;

interface ProjectMentionSearchOptions {
  readonly contextFilePath?: string;
  readonly contextUri?: string;
  readonly projectRoot?: string;
}

interface ProjectMentionCandidateProjection {
  readonly candidate?: AgentProjectMentionCandidate;
  readonly rejectedMediaPath: boolean;
}

export interface RoleplayCandidateSearchSelection {
  readonly projectSearchItemId: string;
  readonly candidateId: string;
  readonly name: string;
  readonly kind: 'character';
  readonly aliases: readonly string[];
  readonly sourceRef?: string;
}

export async function searchProjectMentionCandidates(
  plan: AgentProjectFileSearchPlan,
  options: ProjectMentionSearchOptions = {},
): Promise<readonly AgentProjectMentionCandidate[]> {
  const filter = extractSearchFilter(plan);
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  const isRoleplaySearch = plan.purpose === 'roleplay';
  const result = await vscode.commands.executeCommand<ProjectSearchResult>(
    PROJECT_SEARCH_QUERY_COMMAND,
    {
      text: filter,
      mode: 'mention',
      limit: plan.limit,
      kinds: isRoleplaySearch ? ROLEPLAY_SEARCH_KINDS : MENTION_SEARCH_KINDS,
      ...(isRoleplaySearch ? { partitions: ['creative-entities'] } : {}),
      freshness: 'allow-stale',
      contextFilePath: options.contextFilePath ?? activeEditorUri?.fsPath,
      contextUri: options.contextUri ?? activeEditorUri?.toString(),
      projectRoot: options.projectRoot,
    },
  );

  const items = result?.items ?? [];
  const mentionItems = isRoleplaySearch ? filterRoleplayProjectSearchItems(items) : items;
  const projections = await Promise.all(
    mentionItems.map((item) => projectSearchItemToMentionCandidate(item)),
  );
  const rejectedMediaPathCount = projections.filter(
    (projection) => projection.rejectedMediaPath,
  ).length;
  if (rejectedMediaPathCount > 0) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t(
        'Filtered {0} media item(s) because they do not use a linked workspace path under neko/assets/.',
        rejectedMediaPathCount,
      ),
    );
  }
  return projections.flatMap((projection) => (projection.candidate ? [projection.candidate] : []));
}

function isRoleplayProjectSearchItem(item: ProjectSearchItem): boolean {
  if (item.source.partition !== 'creative-entities' || !isCharacterProjectSearchItem(item)) {
    return false;
  }
  if (item.kind === 'creative-entity') {
    return (
      readEntityProjectionStatus(item) === 'confirmed' &&
      typeof item.navigationData?.['entityId'] === 'string'
    );
  }
  return isConfirmableRoleplayCandidateSearchItem(item);
}

function filterRoleplayProjectSearchItems(
  items: readonly ProjectSearchItem[],
): readonly ProjectSearchItem[] {
  const eligible = items.filter(isRoleplayProjectSearchItem);
  const confirmed = eligible.filter((item) => item.kind === 'creative-entity');
  const confirmedNames = new Set(
    confirmed.map((item) => normalizeRoleplayEntityName(item.canonicalName ?? item.label)),
  );
  const candidatesByName = new Map<string, ProjectSearchItem>();
  for (const candidate of eligible.filter((item) => item.kind === 'entity-candidate')) {
    const name = normalizeRoleplayEntityName(candidate.canonicalName ?? candidate.label);
    if (confirmedNames.has(name)) continue;
    const current = candidatesByName.get(name);
    if (!current || roleplayCandidatePriority(candidate) > roleplayCandidatePriority(current)) {
      candidatesByName.set(name, candidate);
    }
  }
  return [...confirmed, ...candidatesByName.values()];
}

function roleplayCandidatePriority(item: ProjectSearchItem): number {
  return readEntityProjectionStatus(item) === 'open' ? 2 : 1;
}

function normalizeRoleplayEntityName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isConfirmableRoleplayCandidateSearchItem(item: ProjectSearchItem): boolean {
  const status = readEntityProjectionStatus(item);
  return (
    item.kind === 'entity-candidate' &&
    (status === 'open' || (status === 'candidate' && item.source.sourceKind === 'script')) &&
    typeof item.navigationData?.['candidateId'] === 'string'
  );
}

function readEntityProjectionStatus(item: ProjectSearchItem): string | undefined {
  return readString(item.source.metadata?.['status']) ?? readString(item.metadata?.['status']);
}

function isCharacterProjectSearchItem(item: ProjectSearchItem): boolean {
  return (
    isCharacterLikeString(readString(item.source.metadata?.['entityKind'])) ||
    isCharacterLikeString(readString(item.metadata?.['entityType'])) ||
    isCharacterLikeString(item.source.sourceKind) ||
    isCharacterLikeString(readString(item.metadata?.['category'])) ||
    isCharacterLikeString(readString(item.navigationData?.['kind'])) ||
    isCharacterLikeString(readString(item.navigationData?.['entityKind']))
  );
}

function isCharacterLikeString(value: string | undefined): boolean {
  if (!value) return false;
  return ['character', 'role', '角色'].includes(value.trim().toLowerCase());
}

async function projectSearchItemToMentionCandidate(
  item: ProjectSearchItem,
): Promise<ProjectMentionCandidateProjection> {
  if (readString(item.source.partition) === 'asset-library') {
    throw new Error(
      'Legacy Asset Library search results require explicit inspection and migration.',
    );
  }
  const type = mentionTypeForProjectItem(item);
  const source = mentionSourceForProjectItem(item);
  const mediaType = readMentionMediaType(item.metadata?.['mediaType']);
  const thumbnailUri = item.visualResource?.projectedUri ?? item.thumbnailUri;
  const entityType =
    readString(item.source.metadata?.['entityKind']) ??
    readString(item.metadata?.['entityType']) ??
    readString(item.metadata?.['category']) ??
    item.source.sourceKind;
  const referencePath = projectMentionReferencePath(item);
  if (isRejectedMediaLibraryPath(item, referencePath)) {
    return { rejectedMediaPath: true };
  }
  return {
    rejectedMediaPath: false,
    candidate: {
      type,
      id: item.id,
      label: item.label,
      summary: item.description
        ? `${labelForType(type)}: ${item.label} (${item.description})`
        : `${labelForType(type)}: ${item.label}`,
      ...(item.searchText ? { searchText: item.searchText } : {}),
      ...(source ? { source } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      ...(referencePath ? { filePath: referencePath } : {}),
      ...(mediaType ? { mediaType } : {}),
      ...(entityType ? { entityType } : {}),
      ...(thumbnailUri ? { thumbnailUri } : {}),
      navigationData: projectMentionNavigationData(item, referencePath),
    },
  };
}

function projectMentionReferencePath(item: ProjectSearchItem): string | undefined {
  const filePath = readString(item.filePath);
  if (!filePath) return undefined;

  const normalizedPath = normalizeMentionPath(filePath);
  if (!isLocalAbsolutePath(filePath)) {
    return isAllowedMentionReferencePath(item, normalizedPath) ? normalizedPath : undefined;
  }

  const projectRelativePath = contractWithProjectRoot(filePath, item.projectRoot);
  if (projectRelativePath) {
    return projectRelativePath;
  }

  return undefined;
}

function isAllowedMentionReferencePath(item: ProjectSearchItem, referencePath: string): boolean {
  if (item.source.partition !== 'media-library') return true;
  return referencePath.startsWith('neko/assets/') && !referencePath.includes('${');
}

function isRejectedMediaLibraryPath(
  item: ProjectSearchItem,
  referencePath: string | undefined,
): boolean {
  return (
    item.source.partition === 'media-library' &&
    Boolean(readString(item.filePath)) &&
    !referencePath
  );
}

function projectMentionNavigationData(
  item: ProjectSearchItem,
  referencePath: string | undefined,
): Record<string, string> {
  const navigationData: Record<string, unknown> = { ...item.navigationData };
  const rawSourceId = readString(item.source.sourceId);
  const sourceId =
    rawSourceId && isLocalAbsolutePath(rawSourceId) ? (referencePath ?? undefined) : rawSourceId;

  if (referencePath) {
    navigationData['path'] = referencePath;
    navigationData['filePath'] = referencePath;
    navigationData['portablePath'] = referencePath;
  } else {
    removeAbsoluteNavigationPath(navigationData, 'path');
    removeAbsoluteNavigationPath(navigationData, 'filePath');
    removeAbsoluteNavigationPath(navigationData, 'portablePath');
  }

  delete navigationData['resolvedPath'];
  delete navigationData['variable'];

  return stringifyNavigationData({
    ...navigationData,
    projectSearchItemId: item.id,
    projectRoot: item.projectRoot,
    partition: item.source.partition,
    ...(sourceId ? { sourceId } : {}),
    sourceKind: item.source.sourceKind,
    refId: item.source.refId,
    freshness: item.freshness,
  });
}

export async function resolveRoleplayCandidateSearchSelection(input: {
  readonly projectSearchItemId: string;
  readonly projectRoot: string;
  readonly contextFilePath?: string;
  readonly contextUri?: string;
}): Promise<RoleplayCandidateSearchSelection | null> {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  const result = await vscode.commands.executeCommand<ProjectSearchResult>(
    PROJECT_SEARCH_QUERY_COMMAND,
    {
      text: input.projectSearchItemId,
      mode: 'entity-picker',
      limit: 1,
      kinds: ['entity-candidate'],
      partitions: ['creative-entities'],
      freshness: 'allow-stale',
      contextFilePath: input.contextFilePath ?? activeEditorUri?.fsPath,
      contextUri: input.contextUri ?? activeEditorUri?.toString(),
      projectRoot: input.projectRoot,
    },
  );
  const item = result?.items.find(
    (candidate) =>
      candidate.id === input.projectSearchItemId &&
      candidate.projectRoot === input.projectRoot &&
      isConfirmableRoleplayCandidateSearchItem(candidate) &&
      isCharacterProjectSearchItem(candidate),
  );
  if (!item) return null;

  const candidateId = readString(item.navigationData?.['candidateId']);
  const name = readString(item.canonicalName) ?? readString(item.label);
  if (!candidateId || !name) return null;
  const sourceRef = [
    readString(item.navigationData?.['sourceRef']),
    readString(item.source.projectRelativePath),
    readString(item.filePath),
    readString(item.navigationData?.['source']),
    readString(item.source.sourceId),
    readString(item.source.refId),
  ].find(isPortableRoleplaySourceRef);
  return {
    projectSearchItemId: item.id,
    candidateId,
    name,
    kind: 'character',
    aliases: item.aliases ?? [],
    ...(sourceRef ? { sourceRef } : {}),
  };
}

function isPortableRoleplaySourceRef(value: string | undefined): value is string {
  return Boolean(
    value && !isLocalAbsolutePath(value) && !/^(?:file|vscode|https?):\/\//i.test(value),
  );
}

function removeAbsoluteNavigationPath(data: Record<string, unknown>, key: string): void {
  const value = readString(data[key]);
  if (value && isLocalAbsolutePath(value)) {
    delete data[key];
  }
}

function contractWithProjectRoot(filePath: string, projectRoot: string): string | undefined {
  if (!projectRoot) return undefined;
  const relativePath = path.relative(projectRoot, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return normalizeMentionPath(relativePath);
}

function isLocalAbsolutePath(filePath: string): boolean {
  return (
    path.isAbsolute(filePath) || WINDOWS_DRIVE_RE.test(filePath) || WINDOWS_UNC_RE.test(filePath)
  );
}

function normalizeMentionPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function mentionTypeForProjectItem(item: ProjectSearchItem): ProjectMentionExtraType {
  if (item.kind === 'story-scene' || item.kind === 'story-section') return 'scene';
  if (item.kind === 'script-role') return 'character';
  if (item.kind === 'generated-asset') return 'asset';
  if (item.kind === 'media' || item.kind === 'document') return 'media';
  return 'entity';
}

function mentionSourceForProjectItem(item: ProjectSearchItem): ProjectMentionSource | undefined {
  if (item.source.partition === 'story-symbols') return 'story';
  if (item.source.partition === 'media-library' || item.source.partition === 'documents') {
    return 'media-library';
  }
  if (
    item.source.partition === 'creative-entities' ||
    item.source.partition === 'generated-assets'
  ) {
    return 'entity-graph';
  }
  return undefined;
}

function labelForType(type: ProjectMentionExtraType): string {
  if (type === 'character') return 'Character';
  if (type === 'scene') return 'Scene';
  if (type === 'asset') return 'Asset';
  if (type === 'media') return 'Media';
  if (type === 'entity') return 'Entity';
  return 'Context';
}

function stringifyNavigationData(input: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    output[key] = String(value);
  }
  return output;
}

function extractSearchFilter(plan: AgentProjectFileSearchPlan): string {
  const includePattern = plan.includePattern;
  if (includePattern === '**/*') {
    return '';
  }
  const match = /^\*\*\/\*(.*)\*$/.exec(includePattern);
  return (match?.[1] ?? '').trim();
}

function readMentionMediaType(value: unknown): ProjectMentionMediaType | undefined {
  return isMentionMediaType(value) ? value : undefined;
}

function isMentionMediaType(value: unknown): value is ProjectMentionMediaType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
