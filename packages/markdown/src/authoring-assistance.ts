import type { MarkdownDiagnostic } from './diagnostics';
import type { MarkdownNode } from './nodes';
import { parseNormalizedMarkdown } from './parser';
import type { MarkdownStableRef } from './resolution';
import {
  createMarkdownSourceRange,
  MarkdownContractError,
  type MarkdownSourceRange,
} from './source-range';

export type MarkdownAuthoringCompletionKind =
  'gfm-snippet' | 'mention' | 'resource-link' | 'resource-embed';

export interface MarkdownMentionAuthoringCandidate {
  readonly kind: 'mention';
  readonly label: string;
  readonly detail?: string;
  readonly ref: MarkdownStableRef;
}

export interface MarkdownResourceAuthoringCandidate {
  readonly kind: 'resource';
  readonly label: string;
  readonly target: string;
  readonly detail?: string;
  readonly embeddable: boolean;
  readonly ref: MarkdownStableRef;
}

export type MarkdownAuthoringCandidate =
  MarkdownMentionAuthoringCandidate | MarkdownResourceAuthoringCandidate;

export interface MarkdownAuthoringCompletionItem {
  readonly id: string;
  readonly kind: MarkdownAuthoringCompletionKind;
  readonly label: string;
  readonly insertText: string;
  readonly detail?: string;
  readonly ref?: MarkdownStableRef;
}

export interface MarkdownAuthoringCompletionContext {
  readonly kind: Exclude<MarkdownAuthoringCompletionKind, 'gfm-snippet'> | 'gfm-snippet';
  readonly query: string;
  readonly replacementRange: MarkdownSourceRange;
}

export interface MarkdownAuthoringAssistanceProjection {
  readonly context: MarkdownAuthoringCompletionContext;
  readonly items: readonly MarkdownAuthoringCompletionItem[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface ProjectMarkdownAuthoringAssistanceOptions {
  readonly source: string;
  readonly caretOffset: number;
  readonly candidates?: readonly MarkdownAuthoringCandidate[];
  readonly includeGfmSnippets?: boolean;
}

const MENTION_QUERY_RE = /(?:^|[^\p{L}\p{N}_./-])(@[\p{L}\p{N}_.-]{0,80})$/u;
const RESOURCE_QUERY_RE = /(!?)\[\[([^\]\n]*)$/u;
const PORTABLE_MENTION_LABEL_RE = /^[\p{L}\p{N}_.-]{1,80}$/u;
const URI_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/iu;
const WINDOWS_ABSOLUTE_RE = /^[a-z]:[\\/]/iu;
const AUTHORING_PROBE = 'NekoCompletionProbe';

const GFM_SNIPPETS: readonly MarkdownAuthoringCompletionItem[] = Object.freeze([
  {
    id: 'gfm:heading',
    kind: 'gfm-snippet',
    label: '#',
    insertText: '# ',
  },
  {
    id: 'gfm:task-list',
    kind: 'gfm-snippet',
    label: '- [ ]',
    insertText: '- [ ] ',
  },
  {
    id: 'gfm:table',
    kind: 'gfm-snippet',
    label: '| |',
    insertText: '|  |  |\n| --- | --- |\n|  |  |',
  },
  {
    id: 'gfm:fenced-code',
    kind: 'gfm-snippet',
    label: '```',
    insertText: '```\n\n```',
  },
]);

export function projectMarkdownAuthoringAssistance(
  options: ProjectMarkdownAuthoringAssistanceOptions,
): MarkdownAuthoringAssistanceProjection | undefined {
  const { source, caretOffset } = options;
  const caretRange = createMarkdownSourceRange(caretOffset, caretOffset, source.length);
  const lineStart = source.lastIndexOf('\n', Math.max(0, caretOffset - 1)) + 1;
  const linePrefix = source.slice(lineStart, caretOffset);
  const resourceMatch = RESOURCE_QUERY_RE.exec(linePrefix);
  if (resourceMatch) {
    const raw = resourceMatch[0];
    const embed = resourceMatch[1] === '!';
    const query = resourceMatch[2] ?? '';
    const startOffset = caretOffset - raw.length;
    const probe = `${embed ? '!' : ''}[[${query || AUTHORING_PROBE}]]`;
    if (!probeProducesNode(source, startOffset, caretOffset, probe, 'nekoResourceReference')) {
      return undefined;
    }
    return projectResourceAssistance(
      embed ? 'resource-embed' : 'resource-link',
      query,
      createMarkdownSourceRange(startOffset, caretOffset, source.length),
      options.candidates ?? [],
    );
  }

  const mentionMatch = MENTION_QUERY_RE.exec(linePrefix);
  if (mentionMatch) {
    const raw = mentionMatch[1];
    if (!raw) throw new MarkdownContractError('Markdown mention trigger is missing.');
    const query = raw.slice(1);
    const startOffset = caretOffset - raw.length;
    const probe = `@${query || AUTHORING_PROBE}`;
    if (!probeProducesNode(source, startOffset, caretOffset, probe, 'nekoMention')) {
      return undefined;
    }
    return projectMentionAssistance(
      query,
      createMarkdownSourceRange(startOffset, caretOffset, source.length),
      options.candidates ?? [],
    );
  }

  if (
    options.includeGfmSnippets === true &&
    linePrefix.trim().length === 0 &&
    probeProducesNode(source, caretOffset, caretOffset, `@${AUTHORING_PROBE}`, 'nekoMention')
  ) {
    return {
      context: { kind: 'gfm-snippet', query: '', replacementRange: caretRange },
      items: GFM_SNIPPETS,
      diagnostics: [],
    };
  }
  return undefined;
}

export function isPortableMarkdownResourceTarget(target: string): boolean {
  if (
    target.length === 0 ||
    target.trim() !== target ||
    target.includes('\u0000') ||
    target.includes('\\')
  ) {
    return false;
  }
  if (
    target.startsWith('/') ||
    target.startsWith('\\') ||
    WINDOWS_ABSOLUTE_RE.test(target) ||
    URI_SCHEME_RE.test(target)
  ) {
    return false;
  }
  const path = target.split('#', 1)[0] ?? '';
  if (path.length === 0) return false;
  const segments = path.split('/');
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.startsWith('.') &&
      !segment.includes(':'),
  );
}

function projectMentionAssistance(
  query: string,
  replacementRange: MarkdownSourceRange,
  candidates: readonly MarkdownAuthoringCandidate[],
): MarkdownAuthoringAssistanceProjection {
  const diagnostics: MarkdownDiagnostic[] = [];
  const normalizedQuery = query.toLocaleLowerCase();
  const items = candidates.flatMap((candidate): readonly MarkdownAuthoringCompletionItem[] => {
    if (candidate.kind !== 'mention') return [];
    if (!PORTABLE_MENTION_LABEL_RE.test(candidate.label)) {
      diagnostics.push(
        invalidCandidateDiagnostic('mention-label', candidate.label, replacementRange),
      );
      return [];
    }
    if (!matchesQuery(candidate.label, candidate.detail, normalizedQuery)) return [];
    return [
      {
        id: referenceItemId('mention', candidate.ref),
        kind: 'mention',
        label: `@${candidate.label}`,
        insertText: `@${candidate.label}`,
        ...(candidate.detail ? { detail: candidate.detail } : {}),
        ref: candidate.ref,
      },
    ];
  });
  return {
    context: { kind: 'mention', query, replacementRange },
    items,
    diagnostics,
  };
}

function projectResourceAssistance(
  kind: 'resource-link' | 'resource-embed',
  query: string,
  replacementRange: MarkdownSourceRange,
  candidates: readonly MarkdownAuthoringCandidate[],
): MarkdownAuthoringAssistanceProjection {
  const diagnostics: MarkdownDiagnostic[] = [];
  const normalizedQuery = query.toLocaleLowerCase();
  const items = candidates.flatMap((candidate): readonly MarkdownAuthoringCompletionItem[] => {
    if (candidate.kind !== 'resource' || (kind === 'resource-embed' && !candidate.embeddable)) {
      return [];
    }
    if (!isPortableMarkdownResourceTarget(candidate.target)) {
      diagnostics.push(
        invalidCandidateDiagnostic('resource-target', candidate.target, replacementRange),
      );
      return [];
    }
    if (!matchesQuery(candidate.label, candidate.target, normalizedQuery)) return [];
    const prefix = kind === 'resource-embed' ? '!' : '';
    return [
      {
        id: referenceItemId(kind, candidate.ref),
        kind,
        label: candidate.label,
        insertText: `${prefix}[[${candidate.target}]]`,
        detail: candidate.detail ?? candidate.target,
        ref: candidate.ref,
      },
    ];
  });
  return {
    context: { kind, query, replacementRange },
    items,
    diagnostics,
  };
}

function matchesQuery(label: string, detail: string | undefined, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true;
  return (
    label.toLocaleLowerCase().includes(normalizedQuery) ||
    detail?.toLocaleLowerCase().includes(normalizedQuery) === true
  );
}

function probeProducesNode(
  source: string,
  from: number,
  to: number,
  probe: string,
  nodeType: 'nekoMention' | 'nekoResourceReference',
): boolean {
  const probed = `${source.slice(0, from)}${probe}${source.slice(to)}`;
  const result = parseNormalizedMarkdown(probed);
  if (result.status === 'failed') return false;
  return collectNodes(result.document.root).some(
    (node) =>
      node.type === nodeType &&
      node.range.startOffset === from &&
      node.range.endOffset === from + probe.length,
  );
}

function collectNodes(root: MarkdownNode): readonly MarkdownNode[] {
  const nodes: MarkdownNode[] = [root];
  if ('children' in root) {
    for (const child of root.children) nodes.push(...collectNodes(child));
  }
  return nodes;
}

function invalidCandidateDiagnostic(
  field: 'mention-label' | 'resource-target',
  value: string,
  range: MarkdownSourceRange,
): MarkdownDiagnostic {
  return {
    code: 'MD_AUTHORING_CANDIDATE_INVALID',
    severity: 'error',
    phase: 'project',
    parameters: { field, value },
    range,
  };
}

function referenceItemId(kind: string, ref: MarkdownStableRef): string {
  return [kind, ref.namespace ?? '', ref.kind, ref.id].join(':');
}
