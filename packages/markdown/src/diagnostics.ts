import type { MarkdownAnnotationId, MarkdownNodeId } from './identity';
import type { MarkdownSourceRange } from './source-range';

export type MarkdownDiagnosticSeverity = 'info' | 'warning' | 'error' | 'fatal';
export type MarkdownDiagnosticPhase =
  | 'admission'
  | 'parse'
  | 'normalize'
  | 'stream'
  | 'resolve'
  | 'project'
  | 'enhance'
  | 'layout'
  | 'encode';

export type MarkdownDiagnosticParameter = string | number | boolean;

export interface MarkdownExternalDetail {
  readonly source: string;
  readonly detail: string;
}

export interface MarkdownDiagnostic {
  readonly code: string;
  readonly severity: MarkdownDiagnosticSeverity;
  readonly phase: MarkdownDiagnosticPhase;
  readonly parameters: Readonly<Record<string, MarkdownDiagnosticParameter>>;
  readonly range?: MarkdownSourceRange;
  readonly nodeId?: MarkdownNodeId;
  readonly annotationId?: MarkdownAnnotationId;
  readonly externalDetail?: MarkdownExternalDetail;
}
