import {
  buildConfigStateMessage,
  buildConfigChangedMessage,
  buildGlobalErrorMessage,
  type ConfigChangedMessage,
  type ConfigStateMessage,
  type GlobalErrorMessage,
  type SsoErrorMessage,
  type SsoSessionChangedMessage,
  type SsoSessionMessagePayload,
} from '@neko-agent/types';
import type { IAuthSession } from '@neko/shared';

export const NEKO_AUTH_EXTENSION_ID = 'neko.neko-auth';

export interface ConfigBridgeRuntimeLogger {
  error(message: string, details?: unknown): void;
}

export type SsoRuntimeMessage = SsoSessionChangedMessage | SsoErrorMessage;

export interface SsoAuthBridge {
  login(options?: { force?: boolean }): Promise<IAuthSession>;
  logout(): Promise<void>;
}

export interface SsoRuntimeEffects {
  getAuth(): Promise<SsoAuthBridge | undefined>;
  postMessage(message: SsoRuntimeMessage): void | Promise<void>;
}

export type SsoLoginRuntimeResult =
  | { status: 'authenticated'; message: SsoSessionChangedMessage }
  | { status: 'unavailable'; message: SsoErrorMessage }
  | { status: 'failed'; message: SsoErrorMessage };

export type SsoLogoutRuntimeResult =
  | { status: 'cleared'; message: SsoSessionChangedMessage }
  | { status: 'failed'; message: SsoErrorMessage };

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

export function buildConfigBridgeSsoSessionChangedMessage(
  session: IAuthSession | null,
): SsoSessionChangedMessage {
  return buildSsoSessionChangedMessage(session);
}

export function buildConfigBridgeGlobalErrorMessage(input: {
  readonly action: string;
  readonly error: unknown;
}): GlobalErrorMessage {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return buildGlobalErrorMessage(`Failed to ${input.action}: ${message}`);
}

export function runConfigBridgeSsoLoginRuntime(
  input: { force?: boolean },
  effects: SsoRuntimeEffects,
): Promise<SsoLoginRuntimeResult> {
  return runSsoLoginRuntime(input, effects);
}

export function runConfigBridgeSsoLogoutRuntime(
  effects: SsoRuntimeEffects,
): Promise<SsoLogoutRuntimeResult> {
  return runSsoLogoutRuntime(effects);
}

async function runSsoLoginRuntime(
  input: { force?: boolean },
  effects: SsoRuntimeEffects,
): Promise<SsoLoginRuntimeResult> {
  const auth = await effects.getAuth();
  if (!auth) {
    const message = buildSsoErrorMessage('neko-auth extension is not installed or active');
    await effects.postMessage(message);
    return { status: 'unavailable', message };
  }

  try {
    const session = await auth.login({
      ...(input.force !== undefined ? { force: input.force } : {}),
    });
    const message = buildSsoSessionChangedMessage(session);
    await effects.postMessage(message);
    return { status: 'authenticated', message };
  } catch (error) {
    const message = buildSsoErrorMessage(error);
    await effects.postMessage(message);
    return { status: 'failed', message };
  }
}

async function runSsoLogoutRuntime(effects: SsoRuntimeEffects): Promise<SsoLogoutRuntimeResult> {
  const auth = await effects.getAuth();

  try {
    await auth?.logout();
    const message = buildSsoSessionChangedMessage(null);
    await effects.postMessage(message);
    return { status: 'cleared', message };
  } catch (error) {
    const message = buildSsoErrorMessage(error);
    await effects.postMessage(message);
    return { status: 'failed', message };
  }
}

function projectAuthSessionToSsoSession(session: IAuthSession | null): SsoSessionMessagePayload {
  if (!session) return null;
  return {
    user: session.user,
    ...(session.plan !== undefined ? { plan: session.plan } : {}),
    ...(session.usage !== undefined ? { usage: session.usage } : {}),
  };
}

function buildSsoSessionChangedMessage(session: IAuthSession | null): SsoSessionChangedMessage {
  return {
    type: 'ssoSessionChanged',
    session: projectAuthSessionToSsoSession(session),
  };
}

function buildSsoErrorMessage(error: unknown): SsoErrorMessage {
  return {
    type: 'ssoError',
    error: error instanceof Error ? error.message : String(error),
  };
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
