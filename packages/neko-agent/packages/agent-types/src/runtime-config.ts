import type { ConversationRunScope } from './runtime-scope';

/** Mutable future-turn configuration owned by exactly one conversation. */
export interface ConversationConfigState<TConfig> {
  readonly conversationId: string;
  readonly revision: number;
  readonly config: Readonly<TConfig>;
}

/** Immutable configuration captured once when a turn starts. */
export interface TurnConfigSnapshot<TConfig> {
  readonly scope: ConversationRunScope;
  readonly conversationConfigRevision: number;
  readonly config: Readonly<TConfig>;
}

export function createConversationConfigState<TConfig extends object>(input: {
  readonly conversationId: string;
  readonly revision?: number;
  readonly config: TConfig;
}): ConversationConfigState<TConfig> {
  assertNonEmpty(input.conversationId, 'conversationId');
  const revision = input.revision ?? 0;
  assertRevision(revision, 'conversation config revision');
  return Object.freeze({
    conversationId: input.conversationId,
    revision,
    config: freezeConfig(input.config),
  });
}

export function updateConversationConfigState<TConfig extends object>(
  current: ConversationConfigState<TConfig>,
  config: TConfig,
): ConversationConfigState<TConfig> {
  return createConversationConfigState({
    conversationId: current.conversationId,
    revision: current.revision + 1,
    config,
  });
}

export function createTurnConfigSnapshot<TConfig extends object>(input: {
  readonly scope: ConversationRunScope;
  readonly conversationConfig: ConversationConfigState<TConfig>;
}): TurnConfigSnapshot<TConfig> {
  if (input.scope.conversationId !== input.conversationConfig.conversationId) {
    throw new Error(
      `Turn configuration owner mismatch: scope ${input.scope.conversationId} cannot capture ${input.conversationConfig.conversationId}.`,
    );
  }
  return Object.freeze({
    scope: Object.freeze({ ...input.scope }),
    conversationConfigRevision: input.conversationConfig.revision,
    config: input.conversationConfig.config,
  });
}

function freezeConfig<TConfig extends object>(config: TConfig): Readonly<TConfig> {
  return Object.freeze({ ...config });
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must be non-empty.`);
  }
}

function assertRevision(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
}
