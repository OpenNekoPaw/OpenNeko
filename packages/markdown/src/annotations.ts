import type { MarkdownAnnotationId, MarkdownNodeId } from './identity';
import type { MarkdownProvenance, MarkdownSourceRange } from './source-range';

interface MarkdownAnnotationBase {
  readonly id: MarkdownAnnotationId;
  readonly provenance: MarkdownProvenance;
  readonly range: MarkdownSourceRange;
  readonly targetNodeId?: MarkdownNodeId;
}

export interface MarkdownPromptSpanAnnotation extends MarkdownAnnotationBase {
  readonly type: 'promptSpan';
  readonly kind: string;
  readonly fieldId?: string;
  readonly label?: string;
  readonly tone?: string;
  readonly tooltip?: string;
}

export interface MarkdownCreativeTableAnnotation extends MarkdownAnnotationBase {
  readonly type: 'creativeTable';
  readonly targetNodeId: MarkdownNodeId;
  readonly headers: readonly string[];
  readonly unknownColumns: readonly string[];
}

export interface MarkdownProvenanceAnnotation extends MarkdownAnnotationBase {
  readonly type: 'provenance';
  readonly sourceKind: string;
  readonly evidence?: string;
}

export interface MarkdownGenerationPartAnnotation extends MarkdownAnnotationBase {
  readonly type: 'generationPart';
  readonly partKind:
    'intent' | 'reference' | 'operation' | 'camera' | 'dialogue' | 'constraint' | 'detail';
}

export type MarkdownAnnotation =
  | MarkdownPromptSpanAnnotation
  | MarkdownCreativeTableAnnotation
  | MarkdownProvenanceAnnotation
  | MarkdownGenerationPartAnnotation;

export interface MarkdownPromptSpanInput {
  readonly kind: string;
  readonly range: MarkdownSourceRange;
  readonly fieldId?: string;
  readonly label?: string;
  readonly tone?: string;
  readonly tooltip?: string;
}
