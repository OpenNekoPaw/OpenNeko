import type {
  NekoStoryParsedScript,
  ProjectSearchItem,
  ProjectSearchSourceRef,
} from '@neko/shared';
import type {
  DashboardCreativeEntityRow,
  DashboardCreativeEntityState,
} from '@neko/shared/types/dashboard-creative-entity';
import { toDashboardCreativeEntityId } from '@neko/shared/types/dashboard-creative-entity';

export interface ScriptEntityCandidate {
  readonly name: string;
  readonly firstLine?: number;
}

export interface ContextScriptEntitySearchItemOptions {
  readonly projectRoot: string;
  readonly filePath: string;
  readonly projectRelativePath?: string;
  readonly uri?: string;
}

export type StoryScriptParser = (text: string) => NekoStoryParsedScript | undefined;

export function dashboardCreativeEntityRowToProjectSearchItem(
  row: DashboardCreativeEntityRow,
  projectRoot: string,
): ProjectSearchItem {
  const entityKind = row.kind;
  return {
    id: `dashboard:${toDashboardCreativeEntityId(row.ref)}`,
    kind: row.status === 'candidate' ? 'entity-candidate' : 'creative-entity',
    label: row.label,
    description: row.summary ?? `${row.kind} · ${row.status}`,
    icon: iconForEntityKind(row.kind),
    source: {
      partition: 'creative-entities',
      sourceId: row.ref.source,
      sourceKind: row.sourceKind,
      refId: row.ref.entityId ?? row.ref.sourceEntityId,
      metadata: {
        entityKind,
        status: row.status,
        dashboardSourceKind: row.sourceKind,
      },
    },
    projectRoot,
    canonicalName: row.label,
    aliases: row.aliases,
    searchText: buildProjectSearchText([
      row.label,
      row.aliases,
      row.kind,
      row.status,
      row.sourceKind,
      row.summary,
      row.searchText,
    ]),
    navigationData: {
      source: row.ref.source,
      sourceEntityId: row.ref.sourceEntityId,
      ...(row.ref.entityId ? { entityId: row.ref.entityId } : {}),
      entityKind,
      status: row.status,
      sourceKind: row.sourceKind,
      ...(row.ref.workspaceFolder ? { workspaceFolder: row.ref.workspaceFolder } : {}),
      projectRoot,
    },
    freshness: row.freshness,
    metadata: {
      entityType: entityKind,
      entityKind,
      status: row.status,
      sourceKind: row.sourceKind,
      ...(row.occurrenceCount !== undefined ? { occurrenceCount: row.occurrenceCount } : {}),
    },
  };
}

export function dashboardCreativeEntityRowsToProjectSearchItems(
  rows: readonly DashboardCreativeEntityRow[],
  projectRoot: string,
): readonly ProjectSearchItem[] {
  return rows
    .filter((row) => dashboardRowBelongsToProject(row, projectRoot))
    .map((row) => dashboardCreativeEntityRowToProjectSearchItem(row, projectRoot));
}

export function dashboardCreativeEntityStateFreshnessValues(
  state: DashboardCreativeEntityState,
  items: readonly ProjectSearchItem[],
) {
  return [
    ...state.statuses.map((status) => status.freshness),
    ...items.map((item) => item.freshness),
  ];
}

export function extractScriptCharacterCandidates(
  text: string,
  parseStoryScript?: StoryScriptParser,
): readonly ScriptEntityCandidate[] {
  const byName = new Map<string, ScriptEntityCandidate>();
  for (const candidate of extractLineBasedScriptCharacters(text)) {
    byName.set(candidate.name, candidate);
  }

  const parsed = safeParseStoryScript(parseStoryScript, text);
  for (const element of parsed?.elements ?? []) {
    if (element.type !== 'character') continue;
    const name = normalizeScriptCharacterName(readString(element['name']) ?? element.text);
    if (!name || byName.has(name)) continue;
    byName.set(name, { name });
  }

  return [...byName.values()].sort((a, b) => {
    const lineA = a.firstLine ?? Number.MAX_SAFE_INTEGER;
    const lineB = b.firstLine ?? Number.MAX_SAFE_INTEGER;
    return lineA - lineB || a.name.localeCompare(b.name);
  });
}

export function extractLineBasedScriptCharacters(text: string): readonly ScriptEntityCandidate[] {
  const byName = new Map<string, ScriptEntityCandidate>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /^\s*@(.+?)\s*$/.exec(line);
    const name = normalizeScriptCharacterName(match?.[1]);
    if (!name || byName.has(name)) return;
    byName.set(name, { name, firstLine: index });
  });
  return [...byName.values()];
}

export function scriptCharacterCandidateToProjectSearchItem(
  candidate: ScriptEntityCandidate,
  options: ContextScriptEntitySearchItemOptions,
): ProjectSearchItem {
  const source: ProjectSearchSourceRef = {
    partition: 'creative-entities',
    sourceId: 'agent-context-script',
    sourceKind: 'script',
    filePath: options.filePath,
    ...(options.uri ? { uri: options.uri } : {}),
    ...(options.projectRelativePath ? { projectRelativePath: options.projectRelativePath } : {}),
    metadata: { entityKind: 'character', status: 'candidate' },
  };

  return {
    id: `context-script-entity:${options.filePath}:${candidate.name}`,
    kind: 'entity-candidate',
    label: candidate.name,
    description: 'Script character candidate',
    icon: '@',
    source,
    projectRoot: options.projectRoot,
    filePath: options.filePath,
    canonicalName: candidate.name,
    searchText: buildProjectSearchText([
      candidate.name,
      options.filePath,
      'character',
      'candidate',
      'script',
    ]),
    navigationData: {
      source: 'agent-context-script',
      candidateId: candidate.name,
      entityKind: 'character',
      status: 'candidate',
      filePath: options.filePath,
      ...(candidate.firstLine !== undefined ? { line: candidate.firstLine } : {}),
    },
    freshness: 'fresh',
    metadata: {
      entityType: 'character',
      entityKind: 'character',
      status: 'candidate',
    },
  };
}

function safeParseStoryScript(
  parseStoryScript: StoryScriptParser | undefined,
  text: string,
): NekoStoryParsedScript | undefined {
  try {
    return parseStoryScript?.(text);
  } catch {
    return undefined;
  }
}

function normalizeScriptCharacterName(value: string | undefined): string | undefined {
  const name = value?.trim().replace(/^@+/, '').trim();
  return name ? name : undefined;
}

function dashboardRowBelongsToProject(
  row: DashboardCreativeEntityRow,
  projectRoot: string,
): boolean {
  if (!row.ref.projectRoot) return true;
  if (isAbsoluteLocalPath(row.ref.projectRoot)) {
    return normalizeLocalPath(row.ref.projectRoot) === normalizeLocalPath(projectRoot);
  }
  return true;
}

function iconForEntityKind(kind: string): string {
  if (kind === 'character') return '@';
  if (kind === 'scene') return '#';
  if (kind === 'location') return 'location';
  if (kind === 'object') return 'object';
  if (kind === 'style') return 'style';
  if (kind === 'action') return 'action';
  return 'entity';
}

function buildProjectSearchText(
  parts: readonly (string | undefined | readonly string[])[],
): string {
  const flattened: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === 'string') {
      flattened.push(part);
    } else {
      flattened.push(...part.filter(Boolean));
    }
  }
  return flattened.join(' ');
}

function isAbsoluteLocalPath(value: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(value);
}

function normalizeLocalPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
