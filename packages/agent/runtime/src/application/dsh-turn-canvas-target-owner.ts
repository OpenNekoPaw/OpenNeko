import type { CanvasWorkspaceTurnTarget } from '@neko/canvas-domain';

export interface DshTurnCanvasTargetAdmission {
  readonly admissionId: string;
  readonly dshSessionId: string;
}

export interface DshTurnCanvasTargetOwner {
  admit(
    dshSessionId: string,
    target: CanvasWorkspaceTurnTarget | undefined,
  ): DshTurnCanvasTargetAdmission;
  bindQueuedMessage(admissionId: string, messageId: string): void;
  prioritizeQueuedMessage(messageId: string): { readonly rollback: () => void };
  bindStartedTurn(dshSessionId: string, turn: number): void;
  read(dshSessionId: string, turn: number): CanvasWorkspaceTurnTarget | undefined;
  releaseQueuedMessage(messageId: string): void;
  releaseAdmission(admissionId: string): void;
  releaseTurn(dshSessionId: string, turn: number): void;
}

interface PendingAdmission extends DshTurnCanvasTargetAdmission {
  readonly target?: CanvasWorkspaceTurnTarget;
}

/**
 * Binds the composer selection admitted with a message to the real DSH turn emitted by ACP.
 * The owner is session-scoped application state; Canvas delivery never reads current UI selection.
 */
export function createDshTurnCanvasTargetOwner(): DshTurnCanvasTargetOwner {
  let sequence = 0;
  const pendingBySession = new Map<string, PendingAdmission[]>();
  const admissionById = new Map<string, PendingAdmission>();
  const admissionByMessageId = new Map<string, PendingAdmission>();
  const targetByTurn = new Map<string, CanvasWorkspaceTurnTarget | undefined>();
  const turnByStartedAdmissionId = new Map<string, string>();
  const startedAdmissionIdByTurn = new Map<string, string>();

  const owner: DshTurnCanvasTargetOwner = {
    admit(dshSessionId, target) {
      requireIdentity(dshSessionId, 'DSH Session');
      if (target !== undefined && target.workspaceId.trim().length === 0) {
        throw new Error('DSH turn Canvas target requires a Workspace identity.');
      }
      const admission: PendingAdmission = {
        admissionId: `dsh-turn-canvas-target:${++sequence}`,
        dshSessionId,
        ...(target === undefined ? {} : { target }),
      };
      const queue = pendingBySession.get(dshSessionId) ?? [];
      queue.push(admission);
      pendingBySession.set(dshSessionId, queue);
      admissionById.set(admission.admissionId, admission);
      return admission;
    },

    bindQueuedMessage(admissionId, messageId) {
      const admission = admissionById.get(requireIdentity(admissionId, 'Admission'));
      if (admission === undefined) {
        if (turnByStartedAdmissionId.has(admissionId)) return;
        throw new Error(`DSH Canvas target admission '${admissionId}' is not pending.`);
      }
      const identity = requireIdentity(messageId, 'Inbox message');
      if (admissionByMessageId.has(identity)) {
        throw new Error(`DSH Inbox message '${identity}' already has a Canvas target admission.`);
      }
      admissionByMessageId.set(identity, admission);
    },

    prioritizeQueuedMessage(messageId) {
      const identity = requireIdentity(messageId, 'Inbox message');
      const admission = admissionByMessageId.get(identity);
      if (admission === undefined) {
        throw new Error(`DSH Inbox message '${identity}' has no pending Canvas target admission.`);
      }
      const queue = pendingBySession.get(admission.dshSessionId);
      const index = queue?.indexOf(admission) ?? -1;
      if (queue === undefined || index < 0) {
        throw new Error(`DSH Inbox message '${identity}' lost its pending admission order.`);
      }
      if (index > 0) {
        queue.splice(index, 1);
        queue.unshift(admission);
      }
      let rolledBack = false;
      return Object.freeze({
        rollback: () => {
          if (rolledBack) return;
          rolledBack = true;
          const currentQueue = pendingBySession.get(admission.dshSessionId);
          const currentIndex = currentQueue?.indexOf(admission) ?? -1;
          if (currentQueue === undefined || currentIndex < 0 || currentIndex === index) return;
          currentQueue.splice(currentIndex, 1);
          currentQueue.splice(Math.min(index, currentQueue.length), 0, admission);
        },
      });
    },

    bindStartedTurn(dshSessionId, turn) {
      requireTurn(turn);
      const key = turnKey(dshSessionId, turn);
      if (targetByTurn.has(key)) {
        throw new Error(`DSH turn ${turn} already has a Canvas target admission.`);
      }
      const queue = pendingBySession.get(dshSessionId);
      const admission = queue?.shift();
      if (admission === undefined) {
        throw new Error(`DSH turn ${turn} started without a Canvas target admission.`);
      }
      if (queue?.length === 0) pendingBySession.delete(dshSessionId);
      admissionById.delete(admission.admissionId);
      removeQueuedMessageBinding(admissionByMessageId, admission.admissionId);
      targetByTurn.set(key, admission.target);
      turnByStartedAdmissionId.set(admission.admissionId, key);
      startedAdmissionIdByTurn.set(key, admission.admissionId);
    },

    read(dshSessionId, turn) {
      requireTurn(turn);
      const key = turnKey(dshSessionId, turn);
      if (!targetByTurn.has(key)) {
        throw new Error(`DSH turn ${turn} has no bound Canvas target admission.`);
      }
      return targetByTurn.get(key);
    },

    releaseQueuedMessage(messageId) {
      const admission = admissionByMessageId.get(requireIdentity(messageId, 'Inbox message'));
      if (admission === undefined) return;
      releasePendingAdmission(admission, pendingBySession, admissionById, admissionByMessageId);
    },

    releaseAdmission(admissionId) {
      const admission = admissionById.get(admissionId);
      if (admission !== undefined) {
        releasePendingAdmission(admission, pendingBySession, admissionById, admissionByMessageId);
        return;
      }
      const key = turnByStartedAdmissionId.get(admissionId);
      if (key === undefined) return;
      releaseBoundTurn(key, targetByTurn, turnByStartedAdmissionId, startedAdmissionIdByTurn);
    },

    releaseTurn(dshSessionId, turn) {
      const key = turnKey(dshSessionId, requireTurn(turn));
      releaseBoundTurn(key, targetByTurn, turnByStartedAdmissionId, startedAdmissionIdByTurn);
    },
  };
  return Object.freeze(owner);
}

function releaseBoundTurn(
  key: string,
  targetByTurn: Map<string, CanvasWorkspaceTurnTarget | undefined>,
  turnByStartedAdmissionId: Map<string, string>,
  startedAdmissionIdByTurn: Map<string, string>,
): void {
  targetByTurn.delete(key);
  const admissionId = startedAdmissionIdByTurn.get(key);
  if (admissionId !== undefined) turnByStartedAdmissionId.delete(admissionId);
  startedAdmissionIdByTurn.delete(key);
}

function releasePendingAdmission(
  admission: PendingAdmission,
  pendingBySession: Map<string, PendingAdmission[]>,
  admissionById: Map<string, PendingAdmission>,
  admissionByMessageId: Map<string, PendingAdmission>,
): void {
  const queue = pendingBySession.get(admission.dshSessionId);
  if (queue) {
    const index = queue.findIndex((candidate) => candidate.admissionId === admission.admissionId);
    if (index >= 0) queue.splice(index, 1);
    if (queue.length === 0) pendingBySession.delete(admission.dshSessionId);
  }
  admissionById.delete(admission.admissionId);
  removeQueuedMessageBinding(admissionByMessageId, admission.admissionId);
}

function removeQueuedMessageBinding(
  admissionByMessageId: Map<string, PendingAdmission>,
  admissionId: string,
): void {
  for (const [messageId, admission] of admissionByMessageId) {
    if (admission.admissionId === admissionId) admissionByMessageId.delete(messageId);
  }
}

function turnKey(dshSessionId: string, turn: number): string {
  return `${requireIdentity(dshSessionId, 'DSH Session')}:${turn}`;
}

function requireIdentity(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} identity must not be empty.`);
  return value;
}

function requireTurn(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('DSH turn must be a non-negative safe integer.');
  }
  return value;
}
