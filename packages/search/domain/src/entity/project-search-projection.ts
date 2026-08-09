import { parseFountainDocument } from '@neko/screenplay-domain';
import type { ProjectSearchItem, ProjectSearchSourceRef } from '../contracts';

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

export function extractScriptCharacterCandidates(text: string): readonly ScriptEntityCandidate[] {
  const parsed = parseFountainDocument(text, 'project-search-script', {
    maxSourceCodeUnits: Math.max(1, text.length),
  });
  if (parsed.status === 'failed') {
    throw new Error(
      `Canonical Fountain parsing failed: ${parsed.diagnostics[0]?.code ?? 'unknown'}`,
    );
  }
  return parsed.document.characters
    .map((character) => ({
      name: character.name,
      firstLine: Math.max(0, (character.ranges[0]?.start.line ?? 1) - 1),
    }))
    .sort((left, right) => left.firstLine - right.firstLine || left.name.localeCompare(right.name));
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
