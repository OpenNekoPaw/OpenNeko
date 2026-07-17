import { AgentMessageQueueOperationError } from '@neko/agent/runtime';
import type { QueueCommandSemanticResult } from '../presentation/work-queue-presentation';

export function toQueueOperationDiagnostic(error: unknown): QueueCommandSemanticResult {
  if (error instanceof AgentMessageQueueOperationError) {
    return {
      kind: 'diagnostic',
      code: 'operation-failed',
      operationCode: error.code,
      detail: error.message,
    };
  }
  return {
    kind: 'diagnostic',
    code: 'operation-failed',
    detail: error instanceof Error ? error.message : String(error),
  };
}
