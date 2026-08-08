import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { OpenNekoMarkdownExtensionId } from './gfm-profile';
import type { MarkdownNode } from './nodes';
import { parseNormalizedMarkdown } from './parser';

export type OpenNekoMarkdownRichUnavailableReason =
  'source-preserving-adapter-required' | 'semantic-mismatch' | 'semantic-projection-failed';

export type OpenNekoMarkdownRichRoundTripAssessment =
  | { readonly status: 'ready' }
  | {
      readonly status: 'unavailable';
      readonly reason: OpenNekoMarkdownRichUnavailableReason;
      readonly extensions: readonly OpenNekoMarkdownExtensionId[];
    };

interface MdastNode {
  readonly type: string;
  readonly children?: readonly MdastNode[];
  readonly value?: string;
  readonly url?: string;
  readonly title?: string | null;
  readonly alt?: string;
  readonly identifier?: string;
  readonly label?: string | null;
  readonly referenceType?: string;
  readonly depth?: number;
  readonly ordered?: boolean;
  readonly start?: number | null;
  readonly checked?: boolean | null;
  readonly lang?: string | null;
  readonly meta?: string | null;
  readonly align?: readonly (string | null)[];
}

interface Definition {
  readonly destination: string;
  readonly title?: string;
}

const semanticParser = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: true })
  .use(remarkMath);

export function assessOpenNekoMarkdownRichRoundTrip(
  source: string,
  serializedSource: string,
): OpenNekoMarkdownRichRoundTripAssessment {
  const sourceRoot = semanticParser.parse(source) as MdastNode;
  const serializedRoot = semanticParser.parse(serializedSource) as MdastNode;
  const sourceExtensions = collectSourcePreservingExtensions(source, sourceRoot);
  if (sourceExtensions.length > 0) {
    return {
      status: 'unavailable',
      reason: 'source-preserving-adapter-required',
      extensions: sourceExtensions,
    };
  }

  try {
    if (
      JSON.stringify(createSemanticProjection(sourceRoot)) !==
      JSON.stringify(createSemanticProjection(serializedRoot))
    ) {
      return { status: 'unavailable', reason: 'semantic-mismatch', extensions: [] };
    }
  } catch {
    return { status: 'unavailable', reason: 'semantic-projection-failed', extensions: [] };
  }
  return { status: 'ready' };
}

function collectSourcePreservingExtensions(
  source: string,
  root: MdastNode,
): readonly OpenNekoMarkdownExtensionId[] {
  const extensions = new Set<OpenNekoMarkdownExtensionId>();
  visitMdast(root, (node) => {
    if (node.type === 'math' || node.type === 'inlineMath') extensions.add('math');
    if (node.type === 'footnoteDefinition' || node.type === 'footnoteReference') {
      extensions.add('footnote');
    }
  });
  if (extensions.size > 0) return [...extensions].sort();

  const parsed = parseNormalizedMarkdown(source);
  if (parsed.status !== 'ready') return [];
  visitMarkdown(parsed.document.root, (node) => {
    if (node.type === 'nekoMention') extensions.add('neko-mention');
    if (node.type === 'nekoResourceReference') extensions.add('neko-resource-reference');
  });
  return [...extensions].sort();
}

function createSemanticProjection(root: MdastNode): unknown {
  const definitions = new Map<string, Definition>();
  const usedDefinitions = new Set<string>();
  visitMdast(root, (node) => {
    if (node.type !== 'definition') return;
    const identifier = normalizeIdentifier(node.identifier);
    definitions.set(identifier, {
      destination: node.url ?? '',
      ...(node.title ? { title: node.title } : {}),
    });
  });

  const projected = projectNode(root, definitions, usedDefinitions);
  const unusedDefinitions = [...definitions.entries()]
    .filter(([identifier]) => !usedDefinitions.has(identifier))
    .map(([identifier, definition]) => ({ identifier, ...definition }))
    .sort((left, right) => left.identifier.localeCompare(right.identifier));
  return { projected, unusedDefinitions };
}

function projectNode(
  node: MdastNode,
  definitions: ReadonlyMap<string, Definition>,
  usedDefinitions: Set<string>,
): unknown {
  const children = () =>
    (node.children ?? [])
      .filter((child) => child.type !== 'definition')
      .map((child) => projectNode(child, definitions, usedDefinitions));
  switch (node.type) {
    case 'root':
    case 'paragraph':
    case 'blockquote':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'table':
    case 'tableRow':
    case 'tableCell':
      return {
        type: node.type,
        ...(node.type === 'table' ? { align: node.align ?? [] } : {}),
        children: children(),
      };
    case 'heading':
      return { type: node.type, depth: node.depth, children: children() };
    case 'list':
      return {
        type: node.type,
        ordered: node.ordered ?? false,
        ...(node.ordered && node.start !== null && node.start !== undefined
          ? { start: node.start }
          : {}),
        children: children(),
      };
    case 'listItem':
      return {
        type: node.type,
        ...(node.checked === true || node.checked === false ? { checked: node.checked } : {}),
        children: children(),
      };
    case 'linkReference':
    case 'imageReference': {
      const identifier = normalizeIdentifier(node.identifier);
      const definition = definitions.get(identifier);
      if (!definition) {
        return {
          type: node.type,
          identifier,
          referenceType: node.referenceType,
          ...(node.type === 'imageReference' ? { alt: node.alt ?? '' } : { children: children() }),
        };
      }
      usedDefinitions.add(identifier);
      return node.type === 'imageReference'
        ? {
            type: 'image',
            alt: node.alt ?? '',
            url: definition.destination,
            ...(definition.title ? { title: definition.title } : {}),
          }
        : {
            type: 'link',
            url: definition.destination,
            ...(definition.title ? { title: definition.title } : {}),
            children: children(),
          };
    }
    case 'link':
      return {
        type: node.type,
        url: node.url ?? '',
        ...(node.title ? { title: node.title } : {}),
        children: children(),
      };
    case 'image':
      return {
        type: node.type,
        alt: node.alt ?? '',
        url: node.url ?? '',
        ...(node.title ? { title: node.title } : {}),
      };
    case 'code':
      return {
        type: node.type,
        value: node.value ?? '',
        ...(node.lang ? { lang: node.lang } : {}),
        ...(node.meta ? { meta: node.meta } : {}),
      };
    case 'text':
    case 'inlineCode':
    case 'html':
    case 'inlineMath':
    case 'math':
      return { type: node.type, value: node.value ?? '' };
    case 'break':
    case 'thematicBreak':
      return { type: node.type };
    case 'definition':
      return { type: 'definition' };
    default:
      return { type: node.type, children: children() };
  }
}

function normalizeIdentifier(identifier: string | undefined): string {
  return (identifier ?? '').trim().toLocaleLowerCase();
}

function visitMdast(node: MdastNode, visitor: (node: MdastNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) visitMdast(child, visitor);
}

function visitMarkdown(node: MarkdownNode, visitor: (node: MarkdownNode) => void): void {
  visitor(node);
  if ('children' in node) for (const child of node.children) visitMarkdown(child, visitor);
}
