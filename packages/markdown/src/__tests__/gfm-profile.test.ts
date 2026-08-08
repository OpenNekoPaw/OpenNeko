import { describe, expect, it } from 'vitest';
import {
  isOpenNekoMarkdownExternalUrlProtocol,
  OPENNEKO_GFM_PROFILE,
  parseNormalizedMarkdown,
  assertMarkdownRangeContained,
  assertMarkdownSourceRange,
  type MarkdownCodeBlockNode,
  type MarkdownListItemNode,
  type MarkdownNode,
} from '../index';
import { OPENNEKO_GFM_CONFORMANCE_CASES } from '../testing';

describe('OpenNeko GFM profile', () => {
  it('declares the public GFM and extension boundary without duplicate extension identities', () => {
    expect(OPENNEKO_GFM_PROFILE).toMatchObject({
      specification: 'GFM 0.29-gfm',
      singleTildeStrikethrough: true,
      rawHtml: 'preserve-source-render-inert',
      externalUrlProtocols: ['http', 'https', 'mailto'],
    });
    expect(new Set(OPENNEKO_GFM_PROFILE.extensions.map((item) => item.id)).size).toBe(
      OPENNEKO_GFM_PROFILE.extensions.length,
    );
    expect(OPENNEKO_GFM_PROFILE.extensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mermaid-fence', semanticProjection: 'standard-code-block' }),
        expect.objectContaining({ id: 'math', semanticProjection: 'source-only' }),
        expect.objectContaining({ id: 'footnote', semanticProjection: 'unsupported' }),
        expect.objectContaining({ id: 'neko-mention', semanticProjection: 'extension-node' }),
        expect.objectContaining({
          id: 'neko-resource-reference',
          semanticProjection: 'extension-node',
        }),
      ]),
    );
  });

  it('owns the parser external URL protocol policy', () => {
    expect(isOpenNekoMarkdownExternalUrlProtocol('HTTPS:')).toBe(true);
    expect(isOpenNekoMarkdownExternalUrlProtocol('mailto')).toBe(true);
    expect(isOpenNekoMarkdownExternalUrlProtocol('javascript')).toBe(false);
    expect(isOpenNekoMarkdownExternalUrlProtocol('file')).toBe(false);
  });

  for (const fixture of OPENNEKO_GFM_CONFORMANCE_CASES) {
    it(`conforms: ${fixture.id}`, () => {
      const result = parseNormalizedMarkdown(fixture.source);
      if (result.status !== 'ready') {
        throw new Error(
          `Expected ${fixture.id} to parse: ${result.diagnostics.map((item) => item.code).join(', ')}`,
        );
      }
      const nodes = collectNodes(result.document.root);
      const actualTypes = new Set(nodes.map((node) => node.type));
      expect(actualTypes).toEqual(new Set(fixture.expected.nodeTypes));

      if (fixture.expected.sourceRanges === 'valid-contained') {
        for (const node of nodes) {
          assertMarkdownSourceRange(node.range, fixture.source.length, `${node.type} range`);
          expect(node.provenance).toEqual({ kind: 'source', range: node.range });
          if ('children' in node) {
            for (const child of node.children) {
              assertMarkdownRangeContained(node.range, child.range, `${child.type} range`);
            }
          }
        }
      }

      if (fixture.expected.diagnosticCodes) {
        expect(result.document.diagnostics.map((item) => item.code)).toEqual(
          expect.arrayContaining([...fixture.expected.diagnosticCodes]),
        );
      }
      if (fixture.expected.deleteNodeCount !== undefined) {
        expect(nodes.filter((node) => node.type === 'delete')).toHaveLength(
          fixture.expected.deleteNodeCount,
        );
      }
      if (fixture.expected.taskStates) {
        expect(
          nodes
            .filter(
              (node): node is MarkdownListItemNode =>
                node.type === 'listItem' && node.checked !== undefined,
            )
            .map((node) => node.checked),
        ).toEqual(fixture.expected.taskStates);
      }
      if (fixture.expected.tableAlignments) {
        expect(nodes.find((node) => node.type === 'table')).toMatchObject({
          alignments: fixture.expected.tableAlignments,
        });
      }
      if (fixture.expected.linkDestinations) {
        expect(
          nodes.filter((node) => node.type === 'link').map((node) => node.destination),
        ).toEqual(fixture.expected.linkDestinations);
      }
      if (fixture.expected.fencedCodeLanguages) {
        expect(
          nodes
            .filter(
              (node): node is MarkdownCodeBlockNode =>
                node.type === 'codeBlock' && node.kind === 'fenced',
            )
            .map((node) => node.language.normalized),
        ).toEqual(fixture.expected.fencedCodeLanguages);
      }
    });
  }
});

function collectNodes(root: MarkdownNode): readonly MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  visit(root);
  return nodes;

  function visit(node: MarkdownNode): void {
    nodes.push(node);
    if ('children' in node) for (const child of node.children) visit(child);
  }
}
