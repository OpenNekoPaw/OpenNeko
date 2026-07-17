import { createConversationId, isCanonicalConversationId } from '@neko/agent';
import type { ConversationIdOptions } from '@neko/agent';

const PATH_SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface TuiConversationIdDiagnostic {
  readonly code: 'non-canonical';
  readonly value: string;
}

export class TuiConversationIdError extends Error {
  public override readonly name = 'TuiConversationIdError';

  public constructor(public readonly diagnostic: TuiConversationIdDiagnostic) {
    super(diagnostic.code);
  }
}

export function createTuiConversationId(
  workDir: string,
  options: ConversationIdOptions = {},
): string {
  return createConversationId(workDir, options);
}

export function isPathSafeCliConversationId(value: string): boolean {
  return PATH_SAFE_ID_PATTERN.test(value);
}

export function isCanonicalTuiConversationId(value: string): boolean {
  return isCanonicalConversationId(value);
}

export function assertCanonicalTuiConversationId(value: string): string {
  const conversationId = value.trim();
  if (!isCanonicalTuiConversationId(conversationId)) {
    throw new TuiConversationIdError({ code: 'non-canonical', value });
  }
  return conversationId;
}
