import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import {
  projectConversationProjectionPatchForResourceDisplay,
  projectConversationProjectionSnapshotForResourceDisplay,
  messageResourceProjectionKey,
} from '../../input/message-resource-projector';
import type { ConversationProjectionAttachmentHostFrame } from './conversation-projection-attachment-server';
import { createNodeHostContentReadService } from '@neko/content/node';
import {
  contentLocatorKey,
  isContentLocator,
  isContentRepresentationLocator,
  type ContentFingerprint,
  type ContentLocator,
  type ContentRepresentationLocator,
} from '@neko/content';
import type { AgentResourceDisplayProjectionFact } from '@neko/agent-contracts';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';

export interface AgentResourceDisplayLease {
  readonly url: string;
  release(): void;
}

export interface AgentResourceDisplayRegistrationPort {
  registerFile(
    owner: {
      readonly windowId: string;
      readonly viewId: string;
      readonly sessionId: string;
      readonly connectionId: string;
      readonly sourceFingerprint: string;
    },
    source: {
      readonly absolutePath: string;
      readonly mediaType: string;
      readonly sourceFingerprint: string;
    },
  ): Promise<AgentResourceDisplayLease>;
  registerBytes?(
    owner: {
      readonly windowId: string;
      readonly viewId: string;
      readonly sessionId: string;
      readonly connectionId: string;
      readonly sourceFingerprint: string;
    },
    source: {
      readonly bytes: Uint8Array;
      readonly mediaType: string;
      readonly sourceFingerprint: string;
    },
  ): Promise<AgentResourceDisplayLease>;
}

export interface AgentResourceDisplayProjector {
  project(
    frame: ConversationProjectionAttachmentHostFrame,
  ): Promise<ConversationProjectionAttachmentHostFrame>;
  releaseAttachment(attachmentId: string): void;
  dispose(): void;
}

export interface AgentResourceDisplayHostIdentity {
  readonly windowId: string;
  readonly viewId: string;
  readonly connectionId: string;
}

interface DisplayLease {
  readonly attachmentId: string;
  readonly sourceFingerprint: string;
  readonly lease: AgentResourceDisplayLease;
}

const MAX_INLINE_DISPLAY_BYTES = 64 * 1024 * 1024;

export function createAgentResourceDisplayProjector<
  Identity extends AgentResourceDisplayHostIdentity,
>(input: {
  readonly identity: Identity;
  readonly workspace: AssetWorkspaceResolution;
  readonly contentAssets: {
    loadDisplayAsset?(input: {
      readonly locator: ContentLocator | ContentRepresentationLocator;
      readonly maxBytes: number;
      readonly signal?: AbortSignal;
    }): Promise<{
      readonly status: string;
      readonly bytes?: Uint8Array;
      readonly mimeType?: string;
      readonly sizeBytes?: number;
    }>;
  };
  readonly resources: AgentResourceDisplayRegistrationPort;
  readonly recordProjection?: (fact: AgentResourceDisplayProjectionFact) => void;
}): AgentResourceDisplayProjector {
  const contentRead = createNodeHostContentReadService({
    workspaceRoot: input.workspace.workspacePath,
  });
  const leases = new Map<string, DisplayLease>();
  let disposed = false;

  const resolveDisplayLocator = async (
    locator: ContentLocator | ContentRepresentationLocator,
    context: { readonly mediaType?: string },
    attachmentId: string,
    conversationId: string,
  ): Promise<string | undefined> => {
    if (disposed) throw new Error('Desktop Agent resource display projector is disposed.');
    if (
      locator.kind === 'content-representation' ||
      locator.kind === 'document-entry' ||
      locator.kind === 'package-resource'
    ) {
      const loadDisplayAsset = input.contentAssets.loadDisplayAsset;
      const registerBytes = input.resources.registerBytes;
      if (!loadDisplayAsset || !registerBytes) return undefined;
      const loaded = await loadDisplayAsset.call(input.contentAssets, {
        locator,
        maxBytes: MAX_INLINE_DISPLAY_BYTES,
      });
      if (loaded.status !== 'ready' || !loaded.bytes) return undefined;
      const mediaType = requireDisplayMediaType(
        displayLocatorPath(locator),
        loaded.mimeType ?? context.mediaType,
      );
      if (!mediaType) return undefined;
      const sourceFingerprint = bytesFingerprint(loaded.bytes);
      const key = `${attachmentId}:${messageResourceProjectionKey(locator)}`;
      const current = leases.get(key);
      if (current?.sourceFingerprint === sourceFingerprint) return current.lease.url;
      current?.lease.release();
      leases.delete(key);
      const lease = await registerBytes(
        {
          windowId: input.identity.windowId,
          viewId: input.identity.viewId,
          sessionId: `agent-display:${conversationId}:${attachmentId}`,
          connectionId: input.identity.connectionId,
          sourceFingerprint,
        },
        { bytes: loaded.bytes, mediaType, sourceFingerprint },
      );
      leases.set(key, { attachmentId, sourceFingerprint, lease });
      return lease.url;
    }
    const relativePath = projectableWorkspacePath(locator);
    if (!relativePath) return undefined;
    const mediaType = requireDisplayMediaType(relativePath, context.mediaType);
    if (!mediaType) return undefined;
    const metadata = await contentRead.stat(locator);
    if (metadata.status !== 'ready') return undefined;
    const sourceFingerprint = resourceFingerprint(metadata.fingerprint, metadata.byteLength);
    const key = `${attachmentId}:${contentLocatorKey(locator)}`;
    const current = leases.get(key);
    if (current?.sourceFingerprint === sourceFingerprint) return current.lease.url;
    current?.lease.release();
    leases.delete(key);
    const absolutePath = await resolveWorkspaceFile(input.workspace.workspacePath, relativePath);
    const lease = await input.resources.registerFile(
      {
        windowId: input.identity.windowId,
        viewId: input.identity.viewId,
        sessionId: `agent-display:${conversationId}:${attachmentId}`,
        connectionId: input.identity.connectionId,
        sourceFingerprint,
      },
      { absolutePath, mediaType, sourceFingerprint },
    );
    leases.set(key, { attachmentId, sourceFingerprint, lease });
    return lease.url;
  };

  return {
    async project(frame) {
      if (disposed) throw new Error('Desktop Agent resource display projector is disposed.');
      let projected: ConversationProjectionAttachmentHostFrame;
      switch (frame.type) {
        case 'projectionSnapshot':
          projected = {
            ...frame,
            projection: await projectConversationProjectionSnapshotForResourceDisplay(
              frame.projection,
              projectionOptions(frame.key.attachmentId, frame.key.conversationId),
            ),
          };
          break;
        case 'projectionPatch':
          projected = {
            ...frame,
            patch: await projectConversationProjectionPatchForResourceDisplay(
              frame.patch,
              projectionOptions(frame.key.attachmentId, frame.key.conversationId),
            ),
          };
          break;
        case 'projectionDetach':
        case 'projectionProtocolDiagnostic':
          projected = frame;
          break;
      }
      recordProjectedResourceFacts(projected, input.recordProjection);
      return projected;
    },
    releaseAttachment(attachmentId) {
      for (const [key, record] of leases) {
        if (record.attachmentId !== attachmentId) continue;
        record.lease.release();
        leases.delete(key);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of leases.values()) record.lease.release();
      leases.clear();
    },
  };

  function projectionOptions(attachmentId: string, conversationId: string) {
    return {
      resolveDisplayLocator: (
        locator: ContentLocator | ContentRepresentationLocator,
        context: { readonly mediaType?: string },
      ) => resolveDisplayLocator(locator, context, attachmentId, conversationId),
    };
  }
}

function recordProjectedResourceFacts(
  frame: ConversationProjectionAttachmentHostFrame,
  record: ((fact: AgentResourceDisplayProjectionFact) => void) | undefined,
): void {
  if (!record) return;
  switch (frame.type) {
    case 'projectionSnapshot':
      for (const turn of frame.projection.turns) {
        for (const item of turn.items) recordTimelineItem(item, frame.key.conversationId, record);
      }
      return;
    case 'projectionPatch':
      for (const operation of frame.patch.operations) {
        if (operation.operation === 'snapshot' || operation.operation === 'upsert') {
          recordTimelineItem(operation.item, frame.key.conversationId, record);
        }
      }
      return;
    case 'projectionDetach':
    case 'projectionProtocolDiagnostic':
      return;
  }
}

function recordTimelineItem(
  item: Parameters<
    typeof projectConversationProjectionSnapshotForResourceDisplay
  >[0]['turns'][number]['items'][number],
  conversationId: string,
  record: (fact: AgentResourceDisplayProjectionFact) => void,
): void {
  if (item.kind !== 'tool_call' || item.payload.toolCall.result?.data === undefined) return;
  collectProjectedResources(item.payload.toolCall.result.data, new WeakSet(), (projection) => {
    record({
      conversationId,
      toolCallId: item.payload.toolCall.id,
      projectionKind: 'tool-result',
      ...projection,
      renderTarget: 'agent-webview',
    });
  });
}

function collectProjectedResources(
  value: unknown,
  visited: WeakSet<object>,
  record: (
    projection: Pick<
      AgentResourceDisplayProjectionFact,
      'status' | 'locatorKind' | 'transport' | 'diagnosticCodes'
    >,
  ) => void,
): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectProjectedResources(item, visited, record);
    return;
  }
  const owner = Object.fromEntries(Object.entries(value));
  const locator = isContentRepresentationLocator(owner['representationLocator'])
    ? owner['representationLocator']
    : isContentLocator(owner['contentLocator'])
      ? owner['contentLocator']
      : undefined;
  if (locator) {
    const diagnosticCodes = readProjectionDiagnosticCodes(owner['resourceProjectionDiagnostics']);
    const renderUri = owner['renderUri'];
    const authorized =
      typeof renderUri === 'string' && renderUri.startsWith('openneko://resource/');
    if (authorized || diagnosticCodes.length > 0) {
      record({
        status: authorized ? 'authorized' : 'denied',
        locatorKind: locator.kind,
        transport: authorized ? 'openneko-resource' : 'none',
        diagnosticCodes,
      });
    }
  }
  for (const item of Object.values(owner)) collectProjectedResources(item, visited, record);
}

function readProjectionDiagnosticCodes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze(
    value.flatMap((diagnostic) => {
      if (typeof diagnostic !== 'object' || diagnostic === null) return [];
      const code = Reflect.get(diagnostic, 'code');
      return typeof code === 'string' ? [code] : [];
    }),
  );
}

function projectableWorkspacePath(locator: ContentLocator): string | undefined {
  switch (locator.kind) {
    case 'workspace-file':
      return locator.path;
    case 'generated-output':
      return locator.path;
    case 'document-entry':
    case 'package-resource':
      return undefined;
  }
}

function displayLocatorPath(locator: ContentLocator | ContentRepresentationLocator): string {
  const content = locator.kind === 'content-representation' ? locator.source : locator;
  switch (content.kind) {
    case 'workspace-file':
    case 'generated-output':
      return content.path;
    case 'document-entry':
      return content.entryPath;
    case 'package-resource':
      return content.resourcePath;
  }
}

async function resolveWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<string> {
  const root = await realpath(workspaceRoot);
  const target = await realpath(path.join(root, ...relativePath.split('/')));
  const relative = path.relative(root, target);
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error('Desktop Agent display content is outside its authorized workspace.');
  }
  return target;
}

function resourceFingerprint(fingerprint: ContentFingerprint, byteLength: number): string {
  return `${fingerprint.strategy}:${fingerprint.value}:${byteLength}`;
}

function bytesFingerprint(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}:${bytes.byteLength}`;
}

function requireDisplayMediaType(
  relativePath: string,
  declared: string | undefined,
): string | undefined {
  if (declared && isDisplayMediaType(declared)) return declared;
  switch (path.extname(relativePath).slice(1).toLocaleLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/mp4';
    case 'pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}

function isDisplayMediaType(value: string): boolean {
  return (
    value.startsWith('image/') ||
    value.startsWith('audio/') ||
    value.startsWith('video/') ||
    value === 'application/pdf'
  );
}
