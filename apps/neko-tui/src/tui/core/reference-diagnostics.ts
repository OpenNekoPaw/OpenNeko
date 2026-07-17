export interface TuiReferenceLoadingError {
  readonly reference: string;
  readonly error: string;
}

export type TuiReferenceSuggestionDiagnostic =
  | Readonly<{
      readonly code: 'read-failed' | 'parse-failed';
      readonly filePath: string;
      readonly detail: string;
    }>
  | Readonly<{
      readonly code: 'expected-object' | 'expected-array';
      readonly source: string;
    }>
  | Readonly<{
      readonly code: 'expected-entry-object' | 'invalid-entry';
      readonly source: string;
      readonly index: number;
    }>
  | Readonly<{
      readonly code: 'expected-string-field';
      readonly source: string;
      readonly field: string;
    }>;

export class TuiReferenceSuggestionError extends Error {
  constructor(readonly diagnostic: TuiReferenceSuggestionDiagnostic) {
    super(`reference-suggestion:${diagnostic.code}`);
    this.name = 'TuiReferenceSuggestionError';
  }
}
