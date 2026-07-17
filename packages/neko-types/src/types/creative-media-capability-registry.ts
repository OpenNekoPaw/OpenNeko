import {
  CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
  validateCreativeMediaOperationDispatch,
  validateCreativeMediaOperationResult,
  validateCreativeMediaOperationSupport,
  type CreativeMediaKind,
  type CreativeMediaOperationDiagnostic,
  type CreativeMediaOperationRequest,
  type CreativeMediaOperationResult,
  type CreativeMediaOperationSupport,
} from './creative-media-operations';

export interface CreativeMediaOperationAdapter {
  readonly support: CreativeMediaOperationSupport;
  execute?(request: CreativeMediaOperationRequest): Promise<CreativeMediaOperationResult>;
}

export interface CreativeMediaCapabilityNegotiationResult {
  readonly ok: boolean;
  readonly adapter?: CreativeMediaOperationAdapter;
  readonly support?: CreativeMediaOperationSupport;
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
}

export class CreativeMediaOperationCapabilityRegistry {
  private readonly adapters = new Map<string, CreativeMediaOperationAdapter>();

  constructor(readonly mediaKind: CreativeMediaKind) {}

  register(adapter: CreativeMediaOperationAdapter): void {
    const validation = validateCreativeMediaOperationSupport(adapter.support);
    if (!validation.ok) {
      throw new Error(
        `Invalid creative media adapter ${adapter.support.adapterId}: ${validation.diagnostics
          .map((item) => item.message)
          .join('; ')}`,
      );
    }
    if (adapter.support.level !== 'unsupported' && !adapter.execute) {
      throw new Error(
        `Adapter ${adapter.support.adapterId} declares ${adapter.support.level} support without an executor.`,
      );
    }
    if (adapter.support.mediaKind !== this.mediaKind) {
      throw new Error(
        `Adapter ${adapter.support.adapterId} belongs to ${adapter.support.mediaKind}, not ${this.mediaKind}.`,
      );
    }
    const key = adapterKey(adapter.support.adapterId, adapter.support.operationId);
    if (this.adapters.has(key)) {
      throw new Error(
        `Creative media adapter ${adapter.support.adapterId} is already registered for ${adapter.support.operationId}.`,
      );
    }
    this.adapters.set(key, adapter);
  }

  list(
    operationId?: CreativeMediaOperationRequest['operationId'],
  ): readonly CreativeMediaOperationSupport[] {
    return [...this.adapters.values()]
      .map((adapter) => adapter.support)
      .filter((support) => operationId === undefined || support.operationId === operationId);
  }

  negotiate(
    request: CreativeMediaOperationRequest,
    preferredAdapterId?: string,
  ): CreativeMediaCapabilityNegotiationResult {
    if (request.mediaKind !== this.mediaKind) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'operation-unsupported',
            severity: 'error',
            message: `${this.mediaKind} registry cannot negotiate a ${request.mediaKind} request.`,
          },
        ],
      };
    }
    const candidates = [...this.adapters.values()].filter(
      (adapter) =>
        adapter.support.operationId === request.operationId &&
        (preferredAdapterId === undefined || adapter.support.adapterId === preferredAdapterId),
    );
    if (candidates.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'adapter-unavailable',
            severity: 'error',
            message: preferredAdapterId
              ? `Adapter ${preferredAdapterId} is unavailable for ${request.operationId}.`
              : `No adapter is registered for ${request.operationId}.`,
          },
        ],
      };
    }
    const negotiations = candidates.map((adapter) => ({
      adapter,
      validation: validateCreativeMediaOperationDispatch(request, adapter.support),
    }));
    const accepted = negotiations
      .filter((candidate) => candidate.validation.ok)
      .sort(
        (left, right) =>
          supportRank(left.adapter.support.level) - supportRank(right.adapter.support.level),
      )[0];
    if (accepted) {
      return {
        ok: true,
        adapter: accepted.adapter,
        support: accepted.adapter.support,
        diagnostics: accepted.validation.diagnostics,
      };
    }
    return {
      ok: false,
      diagnostics: negotiations.flatMap((candidate) => candidate.validation.diagnostics),
    };
  }

  async dispatch(
    request: CreativeMediaOperationRequest,
    preferredAdapterId?: string,
  ): Promise<CreativeMediaOperationResult> {
    const negotiation = this.negotiate(request, preferredAdapterId);
    if (!negotiation.ok || !negotiation.adapter?.execute) {
      return {
        version: CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
        requestId: request.requestId,
        mediaKind: request.mediaKind,
        operationId: request.operationId,
        status: 'failed',
        outputRefs: [],
        diagnostics: negotiation.diagnostics,
      };
    }
    const result = await negotiation.adapter.execute(request);
    const identityDiagnostics = validateResultIdentity(request, result);
    const validation = validateCreativeMediaOperationResult(result);
    if (!validation.ok || identityDiagnostics.length > 0) {
      return {
        version: CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
        requestId: request.requestId,
        mediaKind: request.mediaKind,
        operationId: request.operationId,
        status: 'failed',
        outputRefs: [],
        diagnostics: [...result.diagnostics, ...validation.diagnostics, ...identityDiagnostics],
      };
    }
    return result;
  }
}

export class ImageOperationCapabilityRegistry extends CreativeMediaOperationCapabilityRegistry {
  constructor() {
    super('image');
  }
}

export class VideoOperationCapabilityRegistry extends CreativeMediaOperationCapabilityRegistry {
  constructor() {
    super('video');
  }
}

function validateResultIdentity(
  request: CreativeMediaOperationRequest,
  result: CreativeMediaOperationResult,
): readonly CreativeMediaOperationDiagnostic[] {
  if (
    result.requestId === request.requestId &&
    result.mediaKind === request.mediaKind &&
    result.operationId === request.operationId
  ) {
    return [];
  }
  return [
    {
      code: 'invalid-operation-result',
      severity: 'error',
      message: 'Creative media adapter result identity does not match the dispatched request.',
      details: {
        expectedRequestId: request.requestId,
        actualRequestId: result.requestId,
        expectedMediaKind: request.mediaKind,
        actualMediaKind: result.mediaKind,
        expectedOperationId: request.operationId,
        actualOperationId: result.operationId,
      },
    },
  ];
}

function adapterKey(
  adapterId: string,
  operationId: CreativeMediaOperationSupport['operationId'],
): string {
  return `${adapterId}:${operationId}`;
}

function supportRank(level: CreativeMediaOperationSupport['level']): number {
  switch (level) {
    case 'supported':
      return 0;
    case 'degraded':
      return 1;
    case 'unsupported':
      return 2;
  }
}
