export type AgentDocumentReaderHostSurface = 'extension' | 'tui' | 'headless';

export function createAgentDocumentReaderModuleUnavailableError(input: {
  readonly packageName: string;
  readonly host: AgentDocumentReaderHostSurface;
  readonly cause?: unknown;
}): Error {
  const causeMessage =
    input.cause instanceof Error
      ? input.cause.message
      : input.cause === undefined
        ? undefined
        : String(input.cause);
  const suffix = causeMessage ? ` Cause: ${causeMessage}` : '';
  return new Error(
    `Agent document reader module "${input.packageName}" is unavailable on ${input.host}.${suffix}`,
  );
}
