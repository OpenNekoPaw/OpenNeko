import type {
  PermissionOptionKind,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';

import type { ConversationDshSessionBindingStore } from './conversation-dsh-session-binding';

const MAX_PERMISSION_OPTIONS = 32;

export interface DshPermissionIdentity {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
}

export interface DshPendingPermissionProjection extends DshPermissionIdentity {
  readonly title: string;
  readonly options: readonly {
    readonly optionId: string;
    readonly name: string;
    readonly kind: PermissionOptionKind;
  }[];
}

export type DshPermissionOwnerErrorCode =
  | 'DSH_PERMISSION_IDENTITY_INVALID'
  | 'DSH_PERMISSION_CONVERSATION_MISSING'
  | 'DSH_PERMISSION_ALREADY_PENDING'
  | 'DSH_PERMISSION_NOT_PENDING'
  | 'DSH_PERMISSION_OPTION_INVALID'
  | 'DSH_PERMISSION_OWNER_RESET'
  | 'DSH_PERMISSION_OWNER_DISPOSED';

export class DshPermissionOwnerError extends Error {
  constructor(
    readonly code: DshPermissionOwnerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DshPermissionOwnerError';
  }
}

interface PendingPermission {
  readonly projection: DshPendingPermissionProjection;
  readonly request: RequestPermissionRequest;
  readonly resolve: (response: RequestPermissionResponse) => void;
}

export class DshPermissionOwner {
  private readonly pending = new Map<string, PendingPermission>();
  private disposed = false;
  private resetCount = 0;

  constructor(
    private readonly options: {
      readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
      readonly onChanged?: (conversationId: string) => Promise<void> | void;
    },
  ) {}

  async request(input: {
    readonly request: RequestPermissionRequest;
    readonly turn: number;
  }): Promise<RequestPermissionResponse> {
    this.requireActive();
    const resetCount = this.resetCount;
    const projection = await this.project(input);
    this.requireActive();
    if (resetCount !== this.resetCount) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_OWNER_RESET',
        'DSH permission owner reset while resolving the request.',
      );
    }
    const key = permissionKey(projection);
    if (this.pending.has(key)) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_ALREADY_PENDING',
        `DSH permission is already pending for ${projection.toolCallId}.`,
      );
    }
    let settle!: (response: RequestPermissionResponse) => void;
    const response = new Promise<RequestPermissionResponse>((resolve) => {
      settle = resolve;
    });
    this.pending.set(key, {
      projection,
      request: input.request,
      resolve: settle,
    });
    await this.changed(projection.conversationId).catch((error: unknown) => {
      this.pending.delete(key);
      throw error;
    });
    return response;
  }

  list(conversationId: string): readonly DshPendingPermissionProjection[] {
    this.requireActive();
    return [...this.pending.values()]
      .map((entry) => entry.projection)
      .filter((projection) => projection.conversationId === conversationId);
  }

  async decide(input: DshPermissionIdentity & { readonly optionId: string }): Promise<void> {
    this.requireActive();
    const key = permissionKey(input);
    const pending = this.pending.get(key);
    if (pending === undefined) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_NOT_PENDING',
        `DSH permission is not pending for ${input.toolCallId}.`,
      );
    }
    if (!pending.request.options.some((option) => option.optionId === input.optionId)) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_OPTION_INVALID',
        `DSH permission option '${input.optionId}' was not advertised for ${input.toolCallId}.`,
      );
    }
    this.pending.delete(key);
    pending.resolve({ outcome: { outcome: 'selected', optionId: input.optionId } });
    await this.changed(input.conversationId);
  }

  async cancel(input: DshPermissionIdentity): Promise<void> {
    this.requireActive();
    const key = permissionKey(input);
    const pending = this.pending.get(key);
    if (pending === undefined) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_NOT_PENDING',
        `DSH permission is not pending for ${input.toolCallId}.`,
      );
    }
    this.pending.delete(key);
    pending.resolve({ outcome: { outcome: 'cancelled' } });
    await this.changed(input.conversationId);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.reset();
  }

  async reset(): Promise<void> {
    this.resetCount += 1;
    const conversations = new Set<string>();
    for (const pending of this.pending.values()) {
      conversations.add(pending.projection.conversationId);
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }
    this.pending.clear();
    await Promise.all([...conversations].map((conversationId) => this.changed(conversationId)));
  }

  private async project(input: {
    readonly request: RequestPermissionRequest;
    readonly turn: number;
  }): Promise<DshPendingPermissionProjection> {
    const { request, turn } = input;
    if (!Number.isSafeInteger(turn) || turn < 0 || request.toolCall.toolCallId.length === 0) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_IDENTITY_INVALID',
        'DSH permission requires an exact non-negative turn and Tool call identity.',
      );
    }
    if (request.options.length === 0 || request.options.length > MAX_PERMISSION_OPTIONS) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_OPTION_INVALID',
        `DSH permission must advertise between 1 and ${MAX_PERMISSION_OPTIONS} options.`,
      );
    }
    const optionIds = new Set<string>();
    for (const option of request.options) {
      if (
        option.optionId.length === 0 ||
        option.name.length === 0 ||
        optionIds.has(option.optionId)
      ) {
        throw new DshPermissionOwnerError(
          'DSH_PERMISSION_OPTION_INVALID',
          'DSH permission options require unique non-empty identities and names.',
        );
      }
      optionIds.add(option.optionId);
    }
    const relation = await this.options.bindings.getByDshSessionId(request.sessionId);
    if (relation === undefined || relation.dshSessionId !== request.sessionId) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_CONVERSATION_MISSING',
        `DSH Session '${request.sessionId}' has no exact Conversation binding.`,
      );
    }
    return Object.freeze({
      conversationId: relation.conversationId,
      dshSessionId: request.sessionId,
      turn,
      toolCallId: request.toolCall.toolCallId,
      title: request.toolCall.title ?? request.toolCall.toolCallId,
      options: Object.freeze(
        request.options.map((option) =>
          Object.freeze({
            optionId: option.optionId,
            name: option.name,
            kind: option.kind,
          }),
        ),
      ),
    });
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new DshPermissionOwnerError(
        'DSH_PERMISSION_OWNER_DISPOSED',
        'DSH permission owner is disposed.',
      );
    }
  }

  private changed(conversationId: string): Promise<void> {
    return Promise.resolve(this.options.onChanged?.(conversationId));
  }
}

function permissionKey(identity: DshPermissionIdentity): string {
  return [
    identity.conversationId,
    identity.dshSessionId,
    String(identity.turn),
    identity.toolCallId,
  ].join('\u0000');
}
