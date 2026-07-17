const EXPLICIT_CHAT_ROUTING_ERROR_CODES = new Set([
  'CHAT_MODEL_SELECTION_REQUIRED',
  'CHAT_MODEL_SELECTION_INCOMPLETE',
  'MODEL_PROVIDER_MISMATCH',
  'MODEL_NOT_FOUND',
  'MODEL_DISABLED',
  'PROVIDER_DISABLED',
  'PROVIDER_NOT_FOUND',
  'ADAPTER_NOT_FOUND',
  'NO_AVAILABLE_MODEL',
  'NO_AVAILABLE_MODEL_FOR_PROVIDER',
]);

const EXPLICIT_CHAT_ROUTING_ERROR_MESSAGE_FRAGMENTS = [
  'requires an explicit chat providerId and modelId',
  'Chat requests require both providerId and modelId',
  'Chat requests require an explicit providerId and modelId',
  'Refusing default model routing',
  'Refusing partial model routing',
];

export function isExplicitChatRoutingError(error: unknown): boolean {
  if (isRecord(error)) {
    const code = error['code'];
    if (typeof code === 'string' && EXPLICIT_CHAT_ROUTING_ERROR_CODES.has(code)) {
      return true;
    }
  }

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return Boolean(
    message &&
    EXPLICIT_CHAT_ROUTING_ERROR_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
