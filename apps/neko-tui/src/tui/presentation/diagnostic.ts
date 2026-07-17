export interface AgentTerminalDiagnostic<
  Code extends string,
  Data extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
> {
  readonly code: Code;
  readonly data: Data;
  readonly externalDetail?: string;
}

export interface AgentTerminalDiagnosticProjection {
  readonly code: string;
  readonly message: string;
}

export function projectAgentTerminalDiagnostic(
  code: string,
  message: string,
  externalDetail?: string,
): AgentTerminalDiagnosticProjection {
  return {
    code,
    message: externalDetail === undefined ? message : `${message}: ${externalDetail}`,
  };
}
