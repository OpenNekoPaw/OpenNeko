import type {
  ExternalProcessorDiagnostic,
  ProcessorResourcePort,
  ProcessorResourcePromotedSourceRef,
  ProcessorResourcePromoteInput,
  ProcessorResourceReferenceInput,
  ProcessorResourceRetentionInput,
  ProcessorResourceStatus,
} from '@neko-agent/types';
import { isPrivateCachePath, type ResourceVariantRequest } from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import type { ResourceCacheOperationResult } from '@neko/shared/vscode/extension';

export interface CreateProcessorResourcePortOptions {
  readonly resourceCache: ResourceCacheService;
  readonly defaultVariant?: ResourceVariantRequest;
  readonly createAsset?: (
    input: ProcessorResourcePromoteInput,
  ) => Promise<ProcessorResourcePromotedSourceRef | void>;
}

export function createProcessorResourcePort(
  options: CreateProcessorResourcePortOptions,
): ProcessorResourcePort {
  return new ExtensionProcessorResourcePort(options);
}

class ExtensionProcessorResourcePort implements ProcessorResourcePort {
  private readonly resourceCache: ResourceCacheService;
  private readonly defaultVariant: ResourceVariantRequest;
  private readonly createAsset?: (
    input: ProcessorResourcePromoteInput,
  ) => Promise<ProcessorResourcePromotedSourceRef | void>;

  constructor(options: CreateProcessorResourcePortOptions) {
    this.resourceCache = options.resourceCache;
    this.defaultVariant = options.defaultVariant ?? { role: 'preview' };
    this.createAsset = options.createAsset;
  }

  async setRetention(input: ProcessorResourceRetentionInput): Promise<ProcessorResourceStatus> {
    const result = await this.resourceCache.updateLifecycle({
      ref: input.resourceRef,
      variant: this.defaultVariant,
      retentionHint: input.retentionHint,
      processorRunId: input.run.processorRunId,
      stageId: input.run.stageId,
      attempt: input.run.attempt,
    });
    return toProcessorResourceStatus(result, input.retentionHint);
  }

  async getStatus(
    resourceRef: ProcessorResourceStatus['resourceRef'],
  ): Promise<ProcessorResourceStatus> {
    const result = await this.resourceCache.resolve(resourceRef, this.defaultVariant);
    return toProcessorResourceStatus(result, readRetentionHint(result) ?? 'intermediate');
  }

  async pin(input: ProcessorResourceReferenceInput): Promise<ProcessorResourceStatus> {
    const result = await this.resourceCache.updateLifecycle({
      ref: input.resourceRef,
      variant: this.defaultVariant,
      retentionHint: 'pinned',
      pinned: true,
      sessionActive: true,
      reason: input.reason,
      ownerId: input.ownerId,
    });
    return toProcessorResourceStatus(result, 'pinned');
  }

  async unpin(input: ProcessorResourceReferenceInput): Promise<ProcessorResourceStatus> {
    const result = await this.resourceCache.updateLifecycle({
      ref: input.resourceRef,
      variant: this.defaultVariant,
      pinned: false,
      sessionActive: false,
      reason: input.reason,
      ownerId: input.ownerId,
    });
    return toProcessorResourceStatus(result, readRetentionHint(result) ?? 'intermediate');
  }

  async markPromoted(input: ProcessorResourcePromoteInput): Promise<ProcessorResourceStatus> {
    if (!this.createAsset) {
      return promotionFailure(input, 'Processor promotion requires an owning project fact writer.');
    }
    const promotedSourceRef = await this.createAsset(input);
    if (!promotedSourceRef) {
      return promotionFailure(
        input,
        'Processor promotion did not produce an owning project fact ref.',
      );
    }
    if (promotedSourceRef.kind !== input.target) {
      return promotionFailure(
        input,
        `Processor promotion fact kind ${promotedSourceRef.kind} does not match target ${input.target}.`,
      );
    }
    if (!isStablePromotedSourceRef(promotedSourceRef)) {
      return promotionFailure(
        input,
        'Processor promotion did not produce a stable project fact ref.',
      );
    }
    const result = await this.resourceCache.updateLifecycle({
      ref: input.resourceRef,
      variant: this.defaultVariant,
      retentionHint: 'promoted',
      promoted: true,
      promotedTarget: input.target,
      processorRunId: input.run.processorRunId,
      stageId: input.run.stageId,
      attempt: input.run.attempt,
    });
    return toProcessorResourceStatus(result, 'promoted', promotedSourceRef);
  }
}

function toProcessorResourceStatus(
  result: ResourceCacheOperationResult,
  retentionHint: ProcessorResourceStatus['retentionHint'],
  promotedSourceRef?: ProcessorResourcePromotedSourceRef | void,
): ProcessorResourceStatus {
  return {
    resourceRef: result.ref,
    retentionHint,
    status: toProcessorStatus(result.status),
    ...(promotedSourceRef ? { promotedSourceRef } : {}),
    diagnostics: result.error ? [diagnostic(result.error)] : [],
  };
}

function promotionFailure(
  input: ProcessorResourcePromoteInput,
  message: string,
): ProcessorResourceStatus {
  return {
    resourceRef: input.resourceRef,
    retentionHint: 'intermediate',
    status: 'failed',
    diagnostics: [diagnostic(message)],
  };
}

function isStablePromotedSourceRef(ref: ProcessorResourcePromotedSourceRef): boolean {
  if (ref.kind === 'asset') return ref.assetId.trim().length > 0;
  const value = ref.path.trim();
  return (
    value.length > 0 &&
    !isPrivateCachePath(value) &&
    !/(?:^|\/)\.neko\/\.cache(?:\/|$)/iu.test(value.replace(/\\/gu, '/')) &&
    !/^(?:[A-Za-z]:[\\/]|[/\\]{1,2})/u.test(value) &&
    !/^(?:blob|data|vscode-webview-resource|vscode-resource|file):/iu.test(value)
  );
}

function readRetentionHint(
  result: ResourceCacheOperationResult,
): ProcessorResourceStatus['retentionHint'] | undefined {
  return result.variantEntry?.retentionHint ?? result.entry?.lifecycle?.retentionHint;
}

function toProcessorStatus(
  status: ResourceCacheOperationResult['status'],
): ProcessorResourceStatus['status'] {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'missing':
      return 'missing';
    case 'stale':
      return 'stale';
    case 'failed':
      return 'failed';
    case 'non-portable':
      return 'non-portable';
    default:
      return status === 'unauthorized' ? 'failed' : 'stale';
  }
}

function diagnostic(message: string): ExternalProcessorDiagnostic {
  return {
    code: 'execution-failed',
    severity: 'error',
    message,
  };
}
