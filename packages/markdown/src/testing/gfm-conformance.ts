import type { MarkdownTableAlignment, MarkdownNode } from '../nodes';

export interface OpenNekoGfmConformanceExpectation {
  readonly nodeTypes: readonly MarkdownNode['type'][];
  readonly sourceRanges?: 'valid-contained';
  readonly diagnosticCodes?: readonly string[];
  readonly deleteNodeCount?: number;
  readonly taskStates?: readonly boolean[];
  readonly tableAlignments?: readonly MarkdownTableAlignment[];
  readonly linkDestinations?: readonly string[];
  readonly fencedCodeLanguages?: readonly string[];
}

export interface OpenNekoGfmConformanceCase {
  readonly id: string;
  readonly specificationSection: string;
  readonly source: string;
  readonly expected: OpenNekoGfmConformanceExpectation;
}

export const OPENNEKO_GFM_CONFORMANCE_CASES: readonly OpenNekoGfmConformanceCase[] = Object.freeze([
  Object.freeze({
    id: 'gfm-strikethrough-one-or-two-tildes',
    specificationSection: 'GFM 0.29-gfm section 6.5',
    source: '~single~ and ~~double~~',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'paragraph', 'delete', 'text'] as const),
      deleteNodeCount: 2,
    }),
  }),
  Object.freeze({
    id: 'gfm-autolink-literals',
    specificationSection: 'GFM 0.29-gfm section 6.9',
    source: 'Visit www.example.com or contact writer@example.com.',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'paragraph', 'link', 'text'] as const),
      linkDestinations: Object.freeze(['http://www.example.com', 'mailto:writer@example.com']),
    }),
  }),
  Object.freeze({
    id: 'gfm-table-alignment-with-cjk',
    specificationSection: 'GFM 0.29-gfm section 4.10',
    source: '| 场景 | 状态 |\n| :--- | ---: |\n| 开场 | 完成 |',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'table', 'tableRow', 'tableCell', 'text'] as const),
      tableAlignments: Object.freeze(['left', 'right'] as const),
    }),
  }),
  Object.freeze({
    id: 'gfm-task-list-items',
    specificationSection: 'GFM 0.29-gfm section 5.3',
    source: '- [x] 已完成\n- [ ] 待处理',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'list', 'listItem', 'paragraph', 'text'] as const),
      taskStates: Object.freeze([true, false]),
    }),
  }),
  Object.freeze({
    id: 'gfm-tagfilter-source-remains-inert-evidence',
    specificationSection: 'GFM 0.29-gfm section 6.11',
    source: '<script>alert(1)</script>',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'html'] as const),
      diagnosticCodes: Object.freeze(['MD_RAW_HTML_PRESERVED']),
    }),
  }),
  Object.freeze({
    id: 'commonmark-reference-and-fenced-code',
    specificationSection: 'CommonMark reference links and fenced code blocks',
    source: '[说明][ref]\n\n[ref]: https://example.com\n\n```mermaid\ngraph LR\n```',
    expected: Object.freeze({
      nodeTypes: Object.freeze([
        'root',
        'paragraph',
        'linkReference',
        'text',
        'definition',
        'codeBlock',
      ] as const),
      fencedCodeLanguages: Object.freeze(['mermaid']),
    }),
  }),
  Object.freeze({
    id: 'unsafe-url-diagnostic',
    specificationSection: 'OpenNeko external URL safety policy',
    source: '[unsafe](javascript:alert(1))',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'paragraph', 'link', 'text'] as const),
      diagnosticCodes: Object.freeze(['MD_UNSAFE_DESTINATION']),
      linkDestinations: Object.freeze(['javascript:alert(1)']),
    }),
  }),
  Object.freeze({
    id: 'openneko-source-backed-extensions',
    specificationSection: 'OpenNeko extension declaration',
    source: '请让 @小橘 查看 [[script.md#Scene 2]] 和 ![[cover.png]]。',
    expected: Object.freeze({
      nodeTypes: Object.freeze([
        'root',
        'paragraph',
        'text',
        'nekoMention',
        'nekoResourceReference',
      ] as const),
      sourceRanges: 'valid-contained',
    }),
  }),
  Object.freeze({
    id: 'malformed-inline-markup-remains-source-backed',
    specificationSection: 'CommonMark unmatched delimiter handling',
    source: '**未闭合 emphasis',
    expected: Object.freeze({
      nodeTypes: Object.freeze(['root', 'paragraph', 'text'] as const),
    }),
  }),
] satisfies readonly OpenNekoGfmConformanceCase[]);
