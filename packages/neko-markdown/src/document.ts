import type { MarkdownAnnotation } from './annotations';
import type { MarkdownDiagnostic } from './diagnostics';
import type { MarkdownRevision, MarkdownSessionId } from './identity';
import type { MarkdownNode, MarkdownRootNode } from './nodes';
import {
  assertMarkdownRangeContained,
  assertMarkdownSourceRange,
  MarkdownContractError,
  type MarkdownSourceRange,
} from './source-range';

export interface NormalizedMarkdownDocument {
  readonly sessionId: MarkdownSessionId;
  readonly revision: MarkdownRevision;
  readonly source: string;
  readonly root: MarkdownRootNode;
  readonly annotations: readonly MarkdownAnnotation[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export function freezeNormalizedMarkdownDocument(
  document: NormalizedMarkdownDocument,
): NormalizedMarkdownDocument {
  freezeNode(document.root);
  Object.freeze(document.annotations);
  for (const annotation of document.annotations) {
    Object.freeze(annotation.range);
    Object.freeze(annotation.provenance);
    Object.freeze(annotation);
  }
  Object.freeze(document.diagnostics);
  for (const diagnostic of document.diagnostics) {
    Object.freeze(diagnostic.parameters);
    if (diagnostic.range) Object.freeze(diagnostic.range);
    if (diagnostic.externalDetail) Object.freeze(diagnostic.externalDetail);
    Object.freeze(diagnostic);
  }
  return Object.freeze(document);
}

function freezeNode(node: MarkdownNode): void {
  if ('children' in node) {
    for (const child of node.children) freezeNode(child);
    Object.freeze(node.children);
  }
  if (node.type === 'table') {
    Object.freeze(node.alignments);
    Object.freeze(node.rows);
  }
  if (node.type === 'tableRow') Object.freeze(node.cells);
  Object.freeze(node.range);
  Object.freeze(node.provenance);
  Object.freeze(node);
}

export function validateNormalizedMarkdownDocument(document: NormalizedMarkdownDocument): void {
  if (
    document.root.range.startOffset !== 0 ||
    document.root.range.endOffset !== document.source.length
  ) {
    throw new MarkdownContractError('Markdown root range must cover the authoritative source.');
  }
  const nodeIds = new Set<string>();
  validateNode(document.root, document.source.length, undefined, nodeIds);

  const annotationIds = collectAnnotationIds(document.annotations);
  for (const annotation of document.annotations) {
    validateAnnotation(annotation, document.source.length, nodeIds, annotationIds);
  }
  for (const diagnostic of document.diagnostics) {
    if (diagnostic.range) {
      assertMarkdownSourceRange(
        diagnostic.range,
        document.source.length,
        'Markdown diagnostic range',
      );
    }
    if (diagnostic.nodeId && !nodeIds.has(diagnostic.nodeId)) {
      throw new MarkdownContractError(
        `Markdown diagnostic ${diagnostic.code} targets unknown node ${diagnostic.nodeId}.`,
      );
    }
    if (diagnostic.annotationId && !annotationIds.has(diagnostic.annotationId)) {
      throw new MarkdownContractError(
        `Markdown diagnostic ${diagnostic.code} targets unknown annotation ${diagnostic.annotationId}.`,
      );
    }
  }
}

function collectAnnotationIds(annotations: readonly MarkdownAnnotation[]): ReadonlySet<string> {
  const annotationIds = new Set<string>();
  for (const annotation of annotations) {
    if (annotationIds.has(annotation.id)) {
      throw new MarkdownContractError(`Duplicate Markdown annotation ID: ${annotation.id}`);
    }
    annotationIds.add(annotation.id);
  }
  return annotationIds;
}

function validateAnnotation(
  annotation: MarkdownAnnotation,
  sourceLength: number,
  nodeIds: ReadonlySet<string>,
  annotationIds: ReadonlySet<string>,
): void {
  assertMarkdownSourceRange(annotation.range, sourceLength, 'Markdown annotation range');
  if (annotation.targetNodeId && !nodeIds.has(annotation.targetNodeId)) {
    throw new MarkdownContractError(
      `Markdown annotation ${annotation.id} targets unknown node ${annotation.targetNodeId}.`,
    );
  }

  if (annotation.provenance.kind === 'source') {
    if (!sameRange(annotation.provenance.range, annotation.range)) {
      throw new MarkdownContractError(
        `Markdown annotation ${annotation.id} provenance range does not match annotation range.`,
      );
    }
    return;
  }

  if (!annotation.provenance.operation.trim()) {
    throw new MarkdownContractError(
      `Synthetic Markdown annotation ${annotation.id} must name its projection operation.`,
    );
  }
  const { originNodeId, originAnnotationId, originRange } = annotation.provenance;
  if (!originNodeId && !originAnnotationId && !originRange) {
    throw new MarkdownContractError(
      `Synthetic Markdown annotation ${annotation.id} must identify an origin.`,
    );
  }
  if (originNodeId && !nodeIds.has(originNodeId)) {
    throw new MarkdownContractError(
      `Synthetic Markdown annotation ${annotation.id} references unknown origin node ${originNodeId}.`,
    );
  }
  if (originAnnotationId && !annotationIds.has(originAnnotationId)) {
    throw new MarkdownContractError(
      `Synthetic Markdown annotation ${annotation.id} references unknown origin annotation ${originAnnotationId}.`,
    );
  }
  if (originAnnotationId === annotation.id) {
    throw new MarkdownContractError(
      `Synthetic Markdown annotation ${annotation.id} cannot reference itself as its origin.`,
    );
  }
  if (originRange) {
    assertMarkdownSourceRange(originRange, sourceLength, 'Synthetic Markdown origin range');
  }
}

function validateNode(
  node: MarkdownNode,
  sourceLength: number,
  parentRange: MarkdownSourceRange | undefined,
  nodeIds: Set<string>,
): void {
  assertMarkdownSourceRange(node.range, sourceLength, `Markdown ${node.type} range`);
  if (parentRange)
    assertMarkdownRangeContained(parentRange, node.range, `Markdown ${node.type} range`);
  if (node.provenance.kind !== 'source') {
    throw new MarkdownContractError(`Semantic node ${node.id} must have source provenance.`);
  }
  if (!sameRange(node.provenance.range, node.range)) {
    throw new MarkdownContractError(
      `Semantic node ${node.id} provenance range does not match node range.`,
    );
  }
  if (nodeIds.has(node.id))
    throw new MarkdownContractError(`Duplicate Markdown node ID: ${node.id}`);
  nodeIds.add(node.id);
  if ('children' in node) {
    for (const child of node.children) validateNode(child, sourceLength, node.range, nodeIds);
  }
}

function sameRange(left: MarkdownSourceRange, right: MarkdownSourceRange): boolean {
  return left.startOffset === right.startOffset && left.endOffset === right.endOffset;
}
