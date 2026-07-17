export type TuiMediaBackgroundDiagnostic = Readonly<{
  readonly code: 'progress-delivery-failed';
  readonly taskId: string;
  readonly error?: unknown;
}>;
