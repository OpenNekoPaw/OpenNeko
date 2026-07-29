export type OtioDiagnosticCode =
  | 'invalid-json'
  | 'invalid-type'
  | 'invalid-value'
  | 'unsupported-schema'
  | 'unsupported-structure'
  | 'unsupported-openneko-metadata';

export interface OtioDiagnostic {
  readonly code: OtioDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export class OtioValidationError extends Error {
  readonly diagnostics: readonly OtioDiagnostic[];

  constructor(message: string, diagnostics: readonly OtioDiagnostic[]) {
    super(message);
    this.name = 'OtioValidationError';
    this.diagnostics = diagnostics;
  }
}

export type OtioParseResult =
  | {
      readonly ok: true;
      readonly document: import('./types').OtioTimeline;
      readonly sourceBytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly OtioDiagnostic[];
      readonly sourceBytes: Uint8Array;
    };
