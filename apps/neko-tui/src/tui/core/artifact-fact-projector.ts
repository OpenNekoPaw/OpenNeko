import { createHash } from 'node:crypto';
import {
  validateCompositeArtifact,
  validateDurableResourceRef,
  type GeneratedAssetRevisionRef,
  isResourceRef,
  type ResourceRef,
  type Task,
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

export function projectTaskOutputArtifactFacts(
  tasks: readonly Task[],
): readonly TerminalArtifactFact[] {
  return tasks.flatMap((task) => {
    const assets = readTaskOutputAssets(task);
    return assets.flatMap((asset) => {
      const resource = asset['resourceRef'];
      if (!isResourceRef(resource)) return [];
      const validation = validateDurableResourceRef(resource);
      const metadata = resource.source.metadata;
      const digest =
        readString(metadata, 'contentDigest') ??
        (resource.fingerprint.strategy === 'hash' ? resource.fingerprint.value : undefined);
      const revision = readString(metadata, 'revision');
      return [
        {
          ref: resource.id,
          kind: resource.source.kind === 'generated-asset' ? 'generated-asset' : 'resource-ref',
          ...(digest ? { digest } : {}),
          ...(revision ? { revision } : {}),
          provenance: {
            source: resource.source.kind,
            taskId: task.id,
            providerId: resource.provider,
          },
          deliveryStatus: task.status === 'completed' ? 'delivered' : 'failed',
          validator: { id: 'durable-resource-ref', status: validation.ok ? 'valid' : 'invalid' },
          diagnostics: validation.diagnostics.map((item) => ({
            code: item.code,
            severity: item.severity,
            message: item.message,
          })),
        } satisfies TerminalArtifactFact,
      ];
    });
  });
}

export function projectGeneratedOutputLifecycleArtifactFacts(
  lifecycles: readonly GeneratedAssetRevisionRef[],
): readonly TerminalArtifactFact[] {
  return lifecycles.map((lifecycle) => {
    const validation = validateDurableResourceRef(lifecycle.resourceRef);
    return {
      ref: lifecycle.resourceRef.id,
      kind: 'generated-asset',
      digest: lifecycle.contentDigest,
      revision: lifecycle.revision,
      provenance: {
        source: lifecycle.resourceRef.source.kind,
        taskId: lifecycle.generation.taskId,
        providerId: lifecycle.resourceRef.provider,
      },
      deliveryStatus: 'delivered',
      validator: { id: 'durable-resource-ref', status: validation.ok ? 'valid' : 'invalid' },
      diagnostics: validation.diagnostics.map((item) => ({
        code: item.code,
        severity: item.severity,
        message: item.message,
      })),
    };
  });
}

export function projectCreatorVisibleArtifactFacts(
  artifacts: readonly CreatorVisibleArtifactCandidate[],
): readonly TerminalArtifactFact[] {
  return artifacts.map((artifact) => {
    if (artifact.resourceRef) {
      const validation = validateDurableResourceRef(artifact.resourceRef);
      return {
        ref: artifact.artifactId,
        kind: artifact.role === 'output' ? 'generated-asset' : 'resource-ref',
        digest: hashStable({
          artifactId: artifact.artifactId,
          revision: artifact.revision,
          resourceRef: artifact.resourceRef,
        }),
        revision: artifact.revision,
        provenance: {
          source: artifact.role === 'source' ? 'source-file' : artifact.resourceRef.source.kind,
          providerId: artifact.resourceRef.provider,
        },
        deliveryStatus: 'delivered',
        validator: { id: 'durable-resource-ref', status: validation.ok ? 'valid' : 'invalid' },
        diagnostics: validation.diagnostics.map((item) => ({
          code: item.code,
          severity: item.severity,
          message: item.message,
        })),
      };
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
      provenance: { source: 'tool-result' },
      deliveryStatus: 'delivered',
      validator: { id: 'composite-artifact-schema', status: 'valid' },
      diagnostics: [],
    };
  });
}

function readTaskOutputAssets(task: Task): readonly Record<string, unknown>[] {
  const data = task.output?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const assets = Object.entries(data).find(([key]) => key === 'assets')?.[1];
  if (!Array.isArray(assets)) return [];
  return assets.filter(
    (asset): asset is Record<string, unknown> =>
      typeof asset === 'object' && asset !== null && !Array.isArray(asset),
  );
}

function projectAttachment(
  attachment: ToolResultAttachment,
  index: number,
  toolCallId: string,
  success: boolean,
): TerminalArtifactFact {
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
