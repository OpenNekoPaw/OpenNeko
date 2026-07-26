import { createHash } from 'node:crypto';
import {
  contentLocatorKey,
  validateCompositeArtifact,
  validateContentLocator,
  validateDurableResourceRef,
  type ContentLocator,
  type GeneratedAssetRevisionRef,
  type ResourceRef,
  type ToolResultArtifactTransfer,
  type ToolResultAttachment,
} from '@neko/shared';
import type { TerminalArtifactFact } from '../types/state';
import type { CreatorVisibleArtifactCandidate } from '@neko/agent/runtime';

export function projectToolResultArtifactFacts(
  result: {
    readonly success: boolean;
    readonly attachments?: readonly ToolResultAttachment[];
    readonly artifacts?: readonly ToolResultArtifactTransfer[];
  },
  toolCallId: string,
): readonly TerminalArtifactFact[] {
  return [
    ...(result.attachments ?? []).map((attachment, index) =>
      projectAttachment(attachment, index, toolCallId, result.success),
    ),
    ...(result.artifacts ?? []).map((artifact) =>
      projectArtifactTransfer(artifact, toolCallId, result.success),
    ),
  ];
}

export function projectGeneratedOutputLifecycleArtifactFacts(
  lifecycles: readonly GeneratedAssetRevisionRef[],
): readonly TerminalArtifactFact[] {
  return lifecycles.map((lifecycle) =>
    projectContentLocator(lifecycle.contentLocator, {
      ref: lifecycle.assetId,
      kind: 'generated-asset',
      success: true,
      operationId: lifecycle.generation.operationId,
      providerId: lifecycle.generation.providerId,
    }),
  );
}

export function projectCreatorVisibleArtifactFacts(
  artifacts: readonly CreatorVisibleArtifactCandidate[],
): readonly TerminalArtifactFact[] {
  return artifacts.map((artifact) => {
    if (artifact.contentLocator) {
      return projectContentLocator(artifact.contentLocator, {
        ref: artifact.artifactId,
        kind: artifact.role === 'output' ? 'generated-asset' : 'content-locator',
        success: true,
        revision: artifact.revision,
        provenanceSource: artifact.role === 'source' ? 'source-file' : undefined,
      });
    }
    if (artifact.kind !== 'markdown') {
      throw new Error(
        `creator-visible-artifact-migration-required: ${artifact.artifactId} has no contentLocator.`,
      );
    }
    return {
      ref: artifact.artifactId,
      kind: 'composite-artifact',
      digest: hashStable({
        artifactId: artifact.artifactId,
        revision: artifact.revision,
        markdown: artifact.markdown,
      }),
      revision: artifact.revision,
      provenance: { source: artifact.provenanceSource ?? 'tool-result' },
      deliveryStatus: 'delivered',
      validator: { id: 'composite-artifact-schema', status: 'valid' },
      diagnostics: [],
    };
  });
}

function projectAttachment(
  attachment: ToolResultAttachment,
  index: number,
  toolCallId: string,
  success: boolean,
): TerminalArtifactFact {
  const contentLocator = attachment.contentLocator ?? attachment.assetRef?.contentLocator;
  if (contentLocator) {
    return projectContentLocator(contentLocator, {
      ref:
        attachment.assetRef?.assetId ??
        (contentLocator.kind === 'generated-output'
          ? contentLocator.outputId
          : `content:${hashStable(contentLocatorKey(contentLocator))}`),
      kind: contentLocator.kind === 'generated-output' ? 'generated-asset' : 'content-locator',
      success,
      toolCallId,
    });
  }
  const resource = attachment.assetRef?.resourceRef;
  if (resource)
    return projectResourceRef(resource, toolCallId, success, attachment.assetRef?.assetId);
  const path = attachment.assetRef?.uri ?? attachment.path;
  const relativePath = isDurableRelativePath(path) ? path : undefined;
  const ref = attachment.assetRef?.assetId ?? `tool:${toolCallId}:attachment:${index + 1}`;
  return {
    ref,
    kind: attachment.assetRef?.assetId ? 'generated-asset' : 'file',
    ...(relativePath ? { relativePath } : {}),
    provenance: { source: 'tool-result', toolCallId },
    deliveryStatus: success ? 'delivered' : 'failed',
    validator: {
      id: 'durable-artifact-path',
      status: relativePath ? 'valid' : 'invalid',
    },
    diagnostics: relativePath
      ? [
          {
            code: 'artifact-digest-unavailable',
            severity: 'warning',
            message: 'Artifact path is durable but no content digest was projected.',
          },
        ]
      : [
          {
            code: 'runtime-artifact-path-rejected',
            severity: 'error',
            message: 'Artifact path is absolute, cached, preview-only, or otherwise non-durable.',
          },
        ],
  };
}

function projectContentLocator(
  contentLocator: ContentLocator,
  input: {
    readonly ref: string;
    readonly kind: Extract<TerminalArtifactFact['kind'], 'content-locator' | 'generated-asset'>;
    readonly success: boolean;
    readonly revision?: string;
    readonly provenanceSource?: string;
    readonly toolCallId?: string;
    readonly operationId?: string;
    readonly providerId?: string;
  },
): TerminalArtifactFact {
  const validation = validateContentLocator(contentLocator);
  const locatorRevision = readContentLocatorRevision(contentLocator);
  const digest = readContentLocatorDigest(contentLocator);
  const relativePath = readContentLocatorPath(contentLocator);
  const revision = input.revision ?? locatorRevision;
  return {
    ref: input.ref,
    kind: input.kind,
    contentLocator,
    ...(relativePath ? { relativePath } : {}),
    ...(digest ? { digest } : {}),
    ...(revision ? { revision } : {}),
    provenance: {
      source: input.provenanceSource ?? contentLocator.kind,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.operationId ? { operationId: input.operationId } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
    },
    deliveryStatus: input.success ? 'delivered' : 'failed',
    validator: { id: 'content-locator', status: validation.ok ? 'valid' : 'invalid' },
    diagnostics: validation.ok
      ? []
      : validation.diagnostics.map((item) => ({
          code: item.code,
          severity: item.severity,
          message: item.message,
        })),
  };
}

function readContentLocatorPath(locator: ContentLocator): string | undefined {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'document-entry':
      return locator.source.path;
    case 'package-resource':
      return undefined;
  }
}

function readContentLocatorRevision(locator: ContentLocator): string | undefined {
  switch (locator.kind) {
    case 'generated-output':
    case 'package-resource':
      return locator.revision;
    case 'workspace-file':
      return locator.fingerprint?.value;
    case 'document-entry':
      return locator.fingerprint?.value ?? locator.source.fingerprint?.value;
  }
}

function readContentLocatorDigest(locator: ContentLocator): string | undefined {
  switch (locator.kind) {
    case 'generated-output':
      return locator.digest;
    case 'workspace-file':
    case 'document-entry':
    case 'package-resource':
      return undefined;
  }
}

function projectResourceRef(
  resource: ResourceRef,
  toolCallId: string,
  success: boolean,
  assetId?: string,
): TerminalArtifactFact {
  const validation = validateDurableResourceRef(resource);
  const metadata = resource.source.metadata;
  const digest =
    readString(metadata, 'contentDigest') ??
    (resource.fingerprint.strategy === 'hash' ? resource.fingerprint.value : undefined);
  const projectRevision = readString(metadata, 'projectRevision');
  const revision = projectRevision ?? readString(metadata, 'revision');
  return {
    ref: resource.id,
    kind: projectRevision
      ? 'project-revision'
      : resource.source.kind === 'generated-asset' || assetId
        ? 'generated-asset'
        : 'resource-ref',
    ...(digest ? { digest } : {}),
    ...(revision ? { revision } : {}),
    provenance: {
      source: resource.source.kind,
      toolCallId,
      providerId: resource.provider,
    },
    deliveryStatus: success ? 'delivered' : 'failed',
    validator: { id: 'durable-resource-ref', status: validation.ok ? 'valid' : 'invalid' },
    diagnostics: [
      ...validation.diagnostics.map((item) => ({
        code: item.code,
        severity: item.severity,
        message: item.message,
      })),
      ...(digest
        ? []
        : [
            {
              code: 'artifact-digest-unavailable',
              severity: 'warning' as const,
              message: 'Durable ResourceRef has no content digest projection.',
            },
          ]),
    ],
  };
}

function projectArtifactTransfer(
  transfer: ToolResultArtifactTransfer,
  toolCallId: string,
  success: boolean,
): TerminalArtifactFact {
  switch (transfer.type) {
    case 'artifactSnapshot':
    case 'artifactBackfill': {
      const validation = validateCompositeArtifact(transfer.artifact);
      return {
        ref: transfer.artifact.artifactId,
        kind: 'composite-artifact',
        digest: hashStable(transfer.artifact),
        provenance: {
          source: transfer.artifact.provenance?.source ?? 'tool-result',
          ...(transfer.artifact.provenance?.skillId
            ? { skillId: transfer.artifact.provenance.skillId }
            : {}),
          toolCallId: transfer.artifact.provenance?.toolCallId ?? toolCallId,
          ...(transfer.artifact.provenance?.taskId
            ? { taskId: transfer.artifact.provenance.taskId }
            : {}),
        },
        deliveryStatus: success ? 'delivered' : 'failed',
        validator: {
          id: 'composite-artifact-schema',
          status: validation.ok ? 'valid' : 'invalid',
        },
        diagnostics: validation.diagnostics.map((item) => ({
          code: item.code,
          severity: item.severity,
          message: item.message,
        })),
      };
    }
    case 'artifactBlockPage':
      return {
        ref: transfer.artifactId,
        kind: 'composite-artifact',
        digest: hashStable(transfer.blocks),
        provenance: { source: 'tool-result', toolCallId },
        deliveryStatus: success ? (transfer.complete ? 'delivered' : 'partial') : 'failed',
        validator: { id: 'composite-artifact-block-page', status: 'unavailable' },
        diagnostics: [],
      };
    case 'artifactExecutionSummary':
      return {
        ref: transfer.summary.artifactId,
        kind: 'composite-artifact',
        digest: hashStable(transfer.summary),
        provenance: {
          source: 'tool-result',
          toolCallId,
          ...(transfer.summary.providerId ? { providerId: transfer.summary.providerId } : {}),
        },
        deliveryStatus: mapExecutionStatus(transfer.summary.status),
        validator: {
          id: 'artifact-execution-summary',
          status: transfer.summary.status === 'failed' ? 'invalid' : 'valid',
        },
        diagnostics: (transfer.summary.diagnostics ?? []).map((item) => ({
          code: item.code,
          severity: item.severity,
          message: item.message,
        })),
      };
  }
}

function mapExecutionStatus(
  status: Extract<
    ToolResultArtifactTransfer,
    { type: 'artifactExecutionSummary' }
  >['summary']['status'],
): TerminalArtifactFact['deliveryStatus'] {
  switch (status) {
    case 'succeeded':
      return 'delivered';
    case 'failed':
      return 'failed';
    case 'partial':
      return 'partial';
    case 'cancelled':
      return 'cancelled';
    case 'unavailable':
      return 'unavailable';
  }
}

function isDurableRelativePath(value: string): boolean {
  if (/^\$\{[A-Z_][A-Z0-9_]*\}\//u.test(value)) return true;
  if (!value || value.startsWith('/') || value.startsWith('~') || /^[A-Za-z]:[\\/]/u.test(value)) {
    return false;
  }
  return !value.split(/[\\/]/u).some((segment) => segment === '..' || segment === '');
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function hashStable(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Cannot hash undefined artifact value');
  return serialized;
}
