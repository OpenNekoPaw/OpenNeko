import type { FountainParsedScript, ProjectSearchItem, ProjectSearchSourceRef } from '@neko/shared';

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

export type StoryScriptParser = (text: string) => FountainParsedScript | undefined;

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
    metadata: {
      entityKind: 'character',
      status: 'candidate',
      identityBasis: 'user-named',
    },
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
      identityBasis: 'user-named',
    },
  };
}

function safeParseStoryScript(
  parseStoryScript: StoryScriptParser | undefined,
  text: string,
): FountainParsedScript | undefined {
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
