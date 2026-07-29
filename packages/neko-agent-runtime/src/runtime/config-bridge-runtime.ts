import {
  buildConfigChangedMessage,
  buildConfigStateMessage,
  buildGlobalErrorMessage,
  type ConfigChangedMessage,
  type ConfigStateMessage,
  type GlobalErrorMessage,
} from '@neko-agent/types';

export interface ConfigBridgeRuntimeLogger {
  error(message: string, details?: unknown): void;
}

export type ConfigBridgeQueryMessage = ConfigStateMessage;
export type ConfigBridgeQueryRequest = { type: 'getConfig' };
export type ConfigBridgeQueryConfigState = NonNullable<ConfigStateMessage['config']>;

export interface ConfigBridgeQueryRuntimeDeps<
  TConfigState extends ConfigBridgeQueryConfigState = ConfigBridgeQueryConfigState,
> {
  getConfigState(): TConfigState;
}

export interface ConfigBridgeQueryRuntimeResult {
  handled: boolean;
  message?: ConfigBridgeQueryMessage;
}

export function buildConfigChangedRuntimeMessage(): ConfigChangedMessage {
  return buildConfigChangedMessage();
}

export function buildConfigBridgeGlobalErrorMessage(input: {
  readonly action: string;
  readonly error: unknown;
}): GlobalErrorMessage {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return buildGlobalErrorMessage(`Failed to ${input.action}: ${message}`);
}

export async function runConfigBridgeQueryRuntime<
  TConfigState extends ConfigBridgeQueryConfigState = ConfigBridgeQueryConfigState,
>(
  request: ConfigBridgeQueryRequest,
  deps: ConfigBridgeQueryRuntimeDeps<TConfigState>,
): Promise<ConfigBridgeQueryRuntimeResult> {
  switch (request.type) {
    case 'getConfig':
      return {
        handled: true,
        message: buildConfigStateMessage(deps.getConfigState()),
      };
  }
}
