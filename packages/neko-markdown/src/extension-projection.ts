import type { MarkdownDiagnostic, MarkdownDiagnosticSeverity } from './diagnostics';
import type { MarkdownNode, MarkdownTableNode } from './nodes';
import {
  parseNormalizedMarkdown,
  stripMarkdownPlacementHint,
  type MarkdownPlacementTarget,
} from './parser';
import type {
  MarkdownHandoffReference,
  MarkdownReferenceStatus,
  MarkdownStableRef,
} from './resolution';
import type { MarkdownSourceRange } from './source-range';

export type NekoMarkdownDiagnosticSeverity = MarkdownDiagnosticSeverity;
export type NekoMarkdownDiagnostic = MarkdownDiagnostic;
export type NekoMarkdownSourceRange = MarkdownSourceRange;
export type NekoMarkdownStableRef = MarkdownStableRef;
export type NekoMarkdownCanvasHandoffRef = MarkdownHandoffReference;
export type NekoMarkdownReferenceStatus = Exclude<MarkdownReferenceStatus, 'unauthorized'>;
export type NekoMarkdownPlacementTarget = MarkdownPlacementTarget;

export interface NekoMarkdownCommonMarkImageReference {
  readonly kind: 'commonmark-image';
  readonly altText: string;
  readonly rawTarget: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly range: MarkdownSourceRange;
}

export interface NekoMarkdownMentionToken {
  readonly kind: 'mention';
  readonly raw: string;
  readonly label: string;
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly candidates: readonly MarkdownStableRef[];
  readonly range: MarkdownSourceRange;
}

export interface NekoMarkdownResourceReferenceToken {
  readonly kind: 'resource-reference';
  readonly embed: boolean;
  readonly raw: string;
  readonly target: string;
  readonly lookupToken: string;
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly candidates: readonly MarkdownStableRef[];
  readonly placementHint?: string;
  readonly range: MarkdownSourceRange;
}

export interface NekoMarkdownCreativeTableProjection {
  readonly kind: 'creative-table';
  readonly range: MarkdownSourceRange;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly unknownColumns: readonly string[];
}

/** Legacy projection input; contextual `ref` is not copied into the normalized annotation. */
export interface NekoMarkdownSemanticPromptSpan {
  readonly kind: string;
  readonly range: MarkdownSourceRange;
  readonly fieldId?: string;
  readonly label?: string;
  readonly ref?: MarkdownStableRef;
  readonly tone?: string;
  readonly tooltip?: string;
}

export interface NekoMarkdownMentionLookup {
  readonly label: string;
  readonly raw: string;
  readonly range: MarkdownSourceRange;
}

export interface NekoMarkdownMentionResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly candidates?: readonly MarkdownStableRef[];
}

export interface NekoMarkdownMentionResolver {
  resolveMention(mention: NekoMarkdownMentionLookup): NekoMarkdownMentionResolution | undefined;
}

export interface NekoMarkdownResourceLookup {
  readonly target: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly embed: boolean;
  readonly range: MarkdownSourceRange;
}

export interface NekoMarkdownResourceResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly candidates?: readonly MarkdownStableRef[];
}

export interface NekoMarkdownResourceResolver {
  resolveResource(resource: NekoMarkdownResourceLookup): NekoMarkdownResourceResolution | undefined;
}

export interface NekoMarkdownCommonMarkImageLookup {
  readonly altText: string;
  readonly rawTarget: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly range: MarkdownSourceRange;
}

export interface NekoMarkdownCommonMarkImageResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly renderUri?: string;
  readonly candidates?: readonly MarkdownStableRef[];
}

export interface NekoMarkdownCommonMarkImageResolver {
  resolveCommonMarkImage(
    image: NekoMarkdownCommonMarkImageLookup,
  ): NekoMarkdownCommonMarkImageResolution | undefined;
}

export interface NekoMarkdownSemanticPromptSpanResolution {
  readonly status: NekoMarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly diagnostics?: readonly MarkdownDiagnostic[];
}

export interface NekoMarkdownSemanticPromptSpanResolver {
  resolvePromptSpan(
    span: NekoMarkdownSemanticPromptSpan,
  ): NekoMarkdownSemanticPromptSpanResolution | undefined;
}

export interface NekoMarkdownRenderAdapter<TRendered = unknown> {
  renderProjection(projection: NekoMarkdownExtensionProjection): TRendered;
}

export interface NekoMarkdownExtensionProjection {
  readonly source: string;
  readonly images: readonly NekoMarkdownCommonMarkImageReference[];
  readonly mentions: readonly NekoMarkdownMentionToken[];
  readonly resourceReferences: readonly NekoMarkdownResourceReferenceToken[];
  readonly creativeTables: readonly NekoMarkdownCreativeTableProjection[];
  readonly promptSpans: readonly NekoMarkdownSemanticPromptSpan[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
  readonly handoffRefs: readonly MarkdownHandoffReference[];
}

export interface NekoMarkdownProjectOptions {
  readonly resourceReferences?: 'disabled' | 'enabled';
  readonly promptSpans?: readonly NekoMarkdownSemanticPromptSpan[];
  readonly creativeTableKnownColumns?: readonly string[];
  readonly mentionResolver?: NekoMarkdownMentionResolver;
  readonly resourceResolver?: NekoMarkdownResourceResolver;
  readonly commonMarkImageResolver?: NekoMarkdownCommonMarkImageResolver;
  readonly promptSpanResolver?: NekoMarkdownSemanticPromptSpanResolver;
  readonly requireResolvedReferences?: boolean;
}

export function projectNekoMarkdownExtensions(
  markdown: string,
  options: NekoMarkdownProjectOptions = {},
): NekoMarkdownExtensionProjection {
  const parsed = parseNormalizedMarkdown(markdown, {
    ...(options.promptSpans
      ? {
          promptSpans: options.promptSpans.map((span) => ({
            kind: span.kind,
            range: span.range,
            ...(span.fieldId ? { fieldId: span.fieldId } : {}),
            ...(span.label ? { label: span.label } : {}),
            ...(span.tone ? { tone: span.tone } : {}),
            ...(span.tooltip ? { tooltip: span.tooltip } : {}),
          })),
        }
      : {}),
    ...(options.creativeTableKnownColumns
      ? { creativeTableKnownColumns: options.creativeTableKnownColumns }
      : {}),
  });
  if (parsed.status === 'failed') {
    return {
      source: markdown,
      images: [],
      mentions: [],
      resourceReferences: [],
      creativeTables: [],
      promptSpans: options.promptSpans ?? [],
      diagnostics: parsed.diagnostics,
      handoffRefs: [],
    };
  }

  const nodes = collectNodes(parsed.document.root);
  const images = nodes.flatMap((node): readonly NekoMarkdownCommonMarkImageReference[] => {
    if (node.type !== 'image') return [];
    const placement = stripMarkdownPlacementHint(node.destination);
    return [
      {
        kind: 'commonmark-image',
        altText: node.altText,
        rawTarget: node.destination,
        lookupToken: placement.lookupToken,
        ...(placement.placementHint ? { placementHint: placement.placementHint } : {}),
        range: node.range,
      },
    ];
  });
  const mentions = nodes.flatMap((node): readonly NekoMarkdownMentionToken[] => {
    if (node.type !== 'nekoMention') return [];
    const lookup = { label: node.label, raw: node.raw, range: node.range };
    const resolution = options.mentionResolver?.resolveMention(lookup);
    return [
      {
        kind: 'mention',
        raw: node.raw,
        label: node.label,
        status: resolution?.status ?? 'unresolved',
        ...(resolution?.ref ? { ref: resolution.ref } : {}),
        candidates: resolution?.candidates ?? [],
        range: node.range,
      },
    ];
  });
  const resourceReferences = nodes.flatMap(
    (node): readonly NekoMarkdownResourceReferenceToken[] => {
      if (node.type !== 'nekoResourceReference') return [];
      const lookup: NekoMarkdownResourceLookup = {
        target: node.target,
        lookupToken: node.lookupToken,
        ...(node.placementHint ? { placementHint: node.placementHint } : {}),
        embed: node.embed,
        range: node.range,
      };
      const resolution =
        options.resourceReferences === 'enabled'
          ? options.resourceResolver?.resolveResource(lookup)
          : undefined;
      return [
        {
          kind: 'resource-reference',
          embed: node.embed,
          raw: node.raw,
          target: node.target,
          lookupToken: node.lookupToken,
          status: resolution?.status ?? 'unresolved',
          ...(resolution?.ref ? { ref: resolution.ref } : {}),
          candidates: resolution?.candidates ?? [],
          ...(node.placementHint ? { placementHint: node.placementHint } : {}),
          range: node.range,
        },
      ];
    },
  );
  const creativeTables = parsed.document.annotations.flatMap(
    (annotation): readonly NekoMarkdownCreativeTableProjection[] => {
      if (annotation.type !== 'creativeTable') return [];
      const table = nodes.find(
        (node): node is MarkdownTableNode =>
          node.id === annotation.targetNodeId && node.type === 'table',
      );
      if (!table) return [];
      return [
        {
          kind: 'creative-table',
          range: annotation.range,
          headers: annotation.headers,
          rows: table.rows.map((row) => row.cells.map(readPlainText)),
          unknownColumns: annotation.unknownColumns,
        },
      ];
    },
  );
  const diagnostics = [
    ...parsed.document.diagnostics,
    ...diagnoseResourceReferences(resourceReferences, options),
    ...diagnoseMentions(mentions, options),
  ];
  const handoffRefs: MarkdownHandoffReference[] = [
    ...mentions.flatMap((mention) =>
      mention.status === 'resolved' && mention.ref
        ? [{ source: 'markdown' as const, ref: mention.ref, token: mention.raw }]
        : [],
    ),
    ...resourceReferences.flatMap((reference) =>
      reference.status === 'resolved' && reference.ref
        ? [
            {
              source: 'markdown' as const,
              ref: reference.ref,
              token: reference.raw,
              ...(reference.placementHint ? { placementHint: reference.placementHint } : {}),
            },
          ]
        : [],
    ),
  ];

  return {
    source: markdown,
    images,
    mentions,
    resourceReferences,
    creativeTables,
    promptSpans: options.promptSpans ?? [],
    diagnostics,
    handoffRefs,
  };
}

export { normalizeMarkdownResourceLookupToken, stripMarkdownPlacementHint } from './parser';

function diagnoseResourceReferences(
  references: readonly NekoMarkdownResourceReferenceToken[],
  options: NekoMarkdownProjectOptions,
): readonly MarkdownDiagnostic[] {
  if (options.resourceReferences !== 'enabled') {
    return references.map((reference) => ({
      severity: 'warning',
      phase: 'resolve',
      code: 'MD_RESOURCE_REFERENCE_UNSUPPORTED',
      parameters: { token: reference.target },
      range: reference.range,
    }));
  }
  if (!options.requireResolvedReferences) return [];
  return references.flatMap((reference) =>
    reference.status === 'resolved'
      ? []
      : [
          {
            severity: 'error' as const,
            phase: 'resolve' as const,
            code:
              reference.status === 'ambiguous'
                ? 'MD_RESOURCE_REFERENCE_AMBIGUOUS'
                : 'MD_RESOURCE_REFERENCE_MISSING',
            parameters: { token: reference.raw },
            range: reference.range,
          },
        ],
  );
}

function diagnoseMentions(
  mentions: readonly NekoMarkdownMentionToken[],
  options: NekoMarkdownProjectOptions,
): readonly MarkdownDiagnostic[] {
  if (!options.requireResolvedReferences) return [];
  return mentions.flatMap((mention) =>
    mention.status === 'resolved'
      ? []
      : [
          {
            severity: 'error' as const,
            phase: 'resolve' as const,
            code: mention.status === 'ambiguous' ? 'MD_MENTION_AMBIGUOUS' : 'MD_MENTION_MISSING',
            parameters: { token: mention.raw },
            range: mention.range,
          },
        ],
  );
}

function collectNodes(root: MarkdownNode): readonly MarkdownNode[] {
  const nodes: MarkdownNode[] = [root];
  if ('children' in root) {
    for (const child of root.children) nodes.push(...collectNodes(child));
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
      return '\n';
    case 'image':
    case 'imageReference':
      return node.altText;
    default:
      return 'children' in node ? node.children.map(readPlainText).join('') : '';
  }
}
