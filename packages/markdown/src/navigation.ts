import type { MarkdownDiagnostic } from './diagnostics';
import type {
  MarkdownDefinitionNode,
  MarkdownHeadingNode,
  MarkdownImageNode,
  MarkdownImageReferenceNode,
  MarkdownLinkNode,
  MarkdownLinkReferenceNode,
  MarkdownNode,
} from './nodes';
import { parseNormalizedMarkdown } from './parser';
import type { MarkdownSourceRange } from './source-range';

export interface MarkdownOutlineEntry {
  readonly id: string;
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
  readonly label: string;
  readonly range: MarkdownSourceRange;
}

export interface MarkdownReferenceEntry {
  readonly id: string;
  readonly kind: 'link' | 'image';
  readonly label: string;
  readonly destination?: string;
  readonly range: MarkdownSourceRange;
}

export interface MarkdownNavigationProjection {
  readonly outline: readonly MarkdownOutlineEntry[];
  readonly references: readonly MarkdownReferenceEntry[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export function projectMarkdownNavigation(source: string): MarkdownNavigationProjection {
  try {
    const parsed = parseNormalizedMarkdown(source);
    if (parsed.status !== 'ready') {
      return { outline: [], references: [], diagnostics: parsed.diagnostics };
    }
    const nodes = collectNodes(parsed.document.root);
    const definitions = new Map(
      nodes
        .filter((node): node is MarkdownDefinitionNode => node.type === 'definition')
        .map((node) => [normalizeIdentifier(node.identifier), node] as const),
    );
    return {
      outline: nodes
        .filter((node): node is MarkdownHeadingNode => node.type === 'heading')
        .map((node) => ({
          id: node.id,
          depth: node.depth,
          label: readPlainText(node) || `Heading ${node.depth}`,
          range: node.range,
        })),
      references: nodes.flatMap((node): readonly MarkdownReferenceEntry[] =>
        projectReference(node, definitions),
      ),
      diagnostics: parsed.document.diagnostics,
    };
  } catch {
    return {
      outline: [],
      references: [],
      diagnostics: [
        {
          code: 'MD_NAVIGATION_PROJECTION_FAILED',
          severity: 'error',
          phase: 'project',
          parameters: { reason: 'unsupported-markdown-syntax' },
        },
      ],
    };
  }
}

function projectReference(
  node: MarkdownNode,
  definitions: ReadonlyMap<string, MarkdownDefinitionNode>,
): readonly MarkdownReferenceEntry[] {
  switch (node.type) {
    case 'link':
      return [reference(node, 'link', readPlainText(node), node.destination)];
    case 'image':
      return [reference(node, 'image', node.altText, node.destination)];
    case 'linkReference': {
      const definition = definitions.get(normalizeIdentifier(node.identifier));
      return [reference(node, 'link', readPlainText(node), definition?.destination)];
    }
    case 'imageReference': {
      const definition = definitions.get(normalizeIdentifier(node.identifier));
      return [reference(node, 'image', node.altText, definition?.destination)];
    }
    default:
      return [];
  }
}

function reference(
  node:
    MarkdownLinkNode | MarkdownImageNode | MarkdownLinkReferenceNode | MarkdownImageReferenceNode,
  kind: MarkdownReferenceEntry['kind'],
  label: string,
  destination: string | undefined,
): MarkdownReferenceEntry {
  return {
    id: node.id,
    kind,
    label,
    ...(destination ? { destination } : {}),
    range: node.range,
  };
}

function collectNodes(node: MarkdownNode): readonly MarkdownNode[] {
  const nodes: MarkdownNode[] = [node];
  if ('children' in node) {
    for (const child of node.children) nodes.push(...collectNodes(child));
  }
  return nodes;
}

function readPlainText(node: MarkdownNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value;
    case 'nekoMention':
    case 'nekoResourceReference':
      return node.raw;
    case 'softBreak':
    case 'hardBreak':
      return ' ';
    case 'image':
    case 'imageReference':
      return node.altText;
    default:
      return 'children' in node ? node.children.map(readPlainText).join('') : '';
  }
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLocaleLowerCase();
}
