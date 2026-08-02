export interface AgentOutputValidationDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AgentOutputValidationResult {
  readonly errors: readonly AgentOutputValidationDiagnostic[];
  readonly warnings: readonly AgentOutputValidationDiagnostic[];
}

/** Domain-neutral extension point for validating final Agent text artifacts. */
export interface AgentOutputValidationAdapter {
  readonly id: string;
  readonly aliases?: readonly string[];
  shouldValidate?(content: string): boolean;
  validate(content: string): AgentOutputValidationResult;
  buildRetryInstruction?(
    errors: readonly AgentOutputValidationDiagnostic[],
    locale?: string,
  ): string | undefined;
}
