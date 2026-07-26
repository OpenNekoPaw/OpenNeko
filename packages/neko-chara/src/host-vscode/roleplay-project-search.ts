import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ProjectSearchItem, ProjectSearchResult } from '@neko/shared';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';

const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;

export interface RoleplayCandidateSearchSelection {
  readonly projectSearchItemId: string;
  readonly candidateId: string;
  readonly name: string;
  readonly kind: 'character';
  readonly aliases: readonly string[];
  readonly sourceRef?: string;
}

export function filterRoleplayProjectSearchItems(
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

function isPortableRoleplaySourceRef(value: string | undefined): value is string {
  return Boolean(
    value && !isLocalAbsolutePath(value) && !/^(?:file|vscode|https?):\/\//i.test(value),
  );
}

function isLocalAbsolutePath(filePath: string): boolean {
  return (
    path.isAbsolute(filePath) || WINDOWS_DRIVE_RE.test(filePath) || WINDOWS_UNC_RE.test(filePath)
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
