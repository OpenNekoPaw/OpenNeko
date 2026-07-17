import { common, createLowlight } from 'lowlight';
import type { MarkdownRevision, MarkdownSessionId, MarkdownSourceRange } from '@neko/markdown';
import type { SyntaxTokenRole, TerminalMarkdownDiagnostic } from './contracts';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY, type MarkdownResourcePolicy } from './resource-policy';

const lowlight = createLowlight(common);

export interface TerminalSyntaxToken {
  readonly text: string;
  readonly role: SyntaxTokenRole;
  readonly sourceRange: MarkdownSourceRange;
}

export interface HighlightGeneration {
  readonly sessionId: MarkdownSessionId;
  readonly revision: MarkdownRevision;
  readonly generation: number;
}

export interface TerminalHighlightRequest extends HighlightGeneration {
  readonly code: string;
  readonly language?: string;
  readonly signal?: AbortSignal;
}

export interface TerminalHighlightedCode extends HighlightGeneration {
  readonly status: 'highlighted';
  readonly language: string;
  readonly code: string;
  readonly tokens: readonly TerminalSyntaxToken[];
  readonly diagnostics: readonly TerminalMarkdownDiagnostic[];
}

export interface TerminalPlainCode extends HighlightGeneration {
  readonly status: 'plain';
  readonly code: string;
  readonly reason: 'no-language' | 'unknown-language' | 'budget-exceeded' | 'runtime-failure';
  readonly diagnostics: readonly TerminalMarkdownDiagnostic[];
}

export interface TerminalDiscardedHighlight extends HighlightGeneration {
  readonly status: 'discarded';
  readonly reason: 'cancelled' | 'stale';
}

export type TerminalHighlightResult =
  TerminalHighlightedCode | TerminalPlainCode | TerminalDiscardedHighlight;

export interface TerminalCodeHighlighter {
  highlight(request: TerminalHighlightRequest): Promise<TerminalHighlightResult>;
}

export class LowlightTerminalCodeHighlighter implements TerminalCodeHighlighter {
  constructor(private readonly policy: MarkdownResourcePolicy = DEFAULT_MARKDOWN_RESOURCE_POLICY) {}

  async highlight(request: TerminalHighlightRequest): Promise<TerminalHighlightResult> {
    if (request.signal?.aborted) return discarded(request, 'cancelled');
    const lineCount = countLines(request.code);
    const byteCount = new TextEncoder().encode(request.code).byteLength;
    if (byteCount > this.policy.highlightMaxBytes || lineCount > this.policy.highlightMaxLines) {
      return plain(request, 'budget-exceeded', [
        {
          code: 'MD_HIGHLIGHT_LIMIT_EXCEEDED',
          severity: 'warning',
          parameters: { byteCount, lineCount },
        },
      ]);
    }
    const language = normalizeHighlightLanguage(request.language);
    if (language === undefined) return plain(request, 'no-language');
    if (!lowlight.registered(language)) {
      return plain(request, 'unknown-language', [
        {
          code: 'TUI_MD_EXTERNAL_ENHANCEMENT_FAILED',
          severity: 'info',
          parameters: { enhancement: 'highlight', reason: 'unknown-language', language },
        },
      ]);
    }

    try {
      await Promise.resolve();
      if (request.signal?.aborted) return discarded(request, 'cancelled');
      const tree = lowlight.highlight(language, request.code);
      const tokens = flattenLowlightTree(tree, request.code.length);
      if (tokens.map((token) => token.text).join('') !== request.code) {
        throw new Error('Lowlight token stream did not preserve the authoritative code value.');
      }
      if (request.signal?.aborted) return discarded(request, 'cancelled');
      return {
        ...identity(request),
        status: 'highlighted',
        language,
        code: request.code,
        tokens,
        diagnostics: [],
      };
    } catch (error) {
      return plain(request, 'runtime-failure', [
        {
          code: 'TUI_MD_EXTERNAL_ENHANCEMENT_FAILED',
          severity: 'warning',
          parameters: {
            enhancement: 'highlight',
            reason: 'runtime-failure',
            detail: error instanceof Error ? error.message : String(error),
          },
        },
      ]);
    }
  }
}

export function acceptTerminalHighlightResult(
  expected: HighlightGeneration,
  result: TerminalHighlightResult,
): TerminalHighlightResult {
  return expected.sessionId === result.sessionId &&
    expected.revision === result.revision &&
    expected.generation === result.generation
    ? result
    : { ...identity(expected), status: 'discarded', reason: 'stale' };
}

export function copyCodeSource(code: string): string {
  return code;
}

function flattenLowlightTree(tree: unknown, sourceLength: number): readonly TerminalSyntaxToken[] {
  const output: TerminalSyntaxToken[] = [];
  let offset = 0;
  visit(tree, 'plain');
  if (offset !== sourceLength)
    throw new Error(`Lowlight token length ${offset} did not match source length ${sourceLength}.`);
  return output;

  function visit(node: unknown, inheritedRole: SyntaxTokenRole): void {
    if (!isRecord(node)) throw new Error('Lowlight returned a non-object syntax node.');
    if (node['type'] === 'text') {
      const value = node['value'];
      if (typeof value !== 'string')
        throw new Error('Lowlight text node omitted its string value.');
      output.push({
        text: value,
        role: inheritedRole,
        sourceRange: { startOffset: offset, endOffset: offset + value.length },
      });
      offset += value.length;
      return;
    }
    const children = node['children'];
    if (!Array.isArray(children)) throw new Error('Lowlight parent node omitted children.');
    const role = resolveLowlightRole(node, inheritedRole);
    for (const child of children) visit(child, role);
  }
}

function resolveLowlightRole(
  node: Readonly<Record<string, unknown>>,
  fallback: SyntaxTokenRole,
): SyntaxTokenRole {
  const properties = node['properties'];
  if (!isRecord(properties)) return fallback;
  const classes = properties['className'];
  if (!Array.isArray(classes)) return fallback;
  for (const item of classes) {
    if (typeof item !== 'string') continue;
    const name = item.replace(/^hljs-/, '');
    if (name.includes('comment') || name === 'quote') return 'comment';
    if (name.includes('string')) return 'string';
    if (name.includes('number')) return 'number';
    if (name.includes('keyword') || name === 'selector-tag') return 'keyword';
    if (name.includes('function') || name === 'title') return 'function';
    if (name.includes('type') || name === 'class') return 'type';
    if (name.includes('literal') || name === 'built_in') return 'literal';
    if (name.includes('operator')) return 'operator';
    if (name.includes('punctuation')) return 'punctuation';
    if (name.includes('property') || name === 'attr') return 'property';
    if (name.includes('tag')) return 'tag';
    if (name.includes('attribute')) return 'attribute';
    if (name.includes('regexp')) return 'regexp';
    if (name.includes('meta')) return 'meta';
  }
  return fallback;
}

export function normalizeHighlightLanguage(language: string | undefined): string | undefined {
  const value = language?.trim().toLowerCase();
  if (!value) return undefined;
  const aliases: Readonly<Record<string, string>> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    md: 'markdown',
    html: 'xml',
    svg: 'xml',
    yml: 'yaml',
  };
  return aliases[value] ?? value;
}
function countLines(value: string): number {
  return value.length === 0 ? 1 : value.split('\n').length;
}
function identity(value: HighlightGeneration): HighlightGeneration {
  return { sessionId: value.sessionId, revision: value.revision, generation: value.generation };
}
function discarded(
  value: HighlightGeneration,
  reason: TerminalDiscardedHighlight['reason'],
): TerminalDiscardedHighlight {
  return { ...identity(value), status: 'discarded', reason };
}
function plain(
  value: TerminalHighlightRequest,
  reason: TerminalPlainCode['reason'],
  diagnostics: readonly TerminalMarkdownDiagnostic[] = [],
): TerminalPlainCode {
  return { ...identity(value), status: 'plain', code: value.code, reason, diagnostics };
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
