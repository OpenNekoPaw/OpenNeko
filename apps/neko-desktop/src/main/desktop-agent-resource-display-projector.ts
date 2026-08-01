import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import {
  projectConversationProjectionPatchForResourceDisplay,
  projectConversationProjectionSnapshotForResourceDisplay,
} from '@neko/agent/runtime';
import type { ConversationProjectionAttachmentHostFrame } from '@neko/agent/runtime/projection/conversation-projection-attachment-server';
import { createNodeHostContentReadService } from '@neko/shared/content-access';
import {
  contentLocatorKey,
  isContentLocator,
  type ContentFingerprint,
  type ContentLocator,
} from '@neko/shared';
import type { DesktopAgentConnectionIdentity } from '../shared/agent-contract';
import type { DesktopAgentResourceDisplayProjectionFact } from '../shared/agent-facts-contract';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';
import type { DesktopResourceLease } from './desktop-resource-registry';

export interface DesktopAgentResourceDisplayRegistrationPort {
  registerFile(
    owner: Parameters<
      import('./desktop-resource-registry').DesktopResourceRegistry['registerFile']
    >[0],
    source: Parameters<
      import('./desktop-resource-registry').DesktopResourceRegistry['registerFile']
    >[1],
  ): Promise<DesktopResourceLease>;
}

export interface DesktopAgentResourceDisplayProjector {
  project(
    frame: ConversationProjectionAttachmentHostFrame,
  ): Promise<ConversationProjectionAttachmentHostFrame>;
  releaseAttachment(attachmentId: string): void;
  dispose(): void;
}

interface DisplayLease {
  readonly attachmentId: string;
  readonly revision: string;
  readonly lease: DesktopResourceLease;
}

export function createDesktopAgentResourceDisplayProjector(input: {
  readonly identity: DesktopAgentConnectionIdentity;
  readonly workspace: DesktopWorkspaceResolution;
  readonly resources: DesktopAgentResourceDisplayRegistrationPort;
  readonly recordProjection?: (fact: DesktopAgentResourceDisplayProjectionFact) => void;
}): DesktopAgentResourceDisplayProjector {
  const contentRead = createNodeHostContentReadService({
    workspaceRoot: input.workspace.workspacePath,
  });
  const leases = new Map<string, DisplayLease>();
  let disposed = false;

  const resolveContentLocator = async (
    locator: ContentLocator,
    context: { readonly mediaType?: string },
    attachmentId: string,
    conversationId: string,
    generation: number,
  ): Promise<string | undefined> => {
    if (disposed) throw new Error('Desktop Agent resource display projector is disposed.');
    const relativePath = projectableWorkspacePath(locator);
    if (!relativePath) return undefined;
    const mediaType = requireDisplayMediaType(relativePath, context.mediaType);
    if (!mediaType) return undefined;
    const metadata = await contentRead.stat(locator);
    if (metadata.status !== 'ready') return undefined;
    const revision = contentRevision(metadata.fingerprint, metadata.byteLength);
    const key = `${attachmentId}:${contentLocatorKey(locator)}`;
    const current = leases.get(key);
    if (current?.revision === revision) return current.lease.url;
    current?.lease.release();
    leases.delete(key);
    const absolutePath = await resolveWorkspaceFile(input.workspace.workspacePath, relativePath);
    const lease = await input.resources.registerFile(
      {
        windowId: input.identity.windowId,
        viewId: input.identity.viewId,
        sessionId: `agent-display:${conversationId}:${attachmentId}`,
        endpointEpoch: input.identity.connectionId,
        revision,
        generation: String(generation),
      },
      { absolutePath, mediaType, revision },
    );
    leases.set(key, { attachmentId, revision, lease });
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
              projectionOptions(
                frame.key.attachmentId,
                frame.key.conversationId,
                frame.projectionVersion,
              ),
            ),
          };
          break;
        case 'projectionPatch':
          projected = {
            ...frame,
            patch: await projectConversationProjectionPatchForResourceDisplay(
              frame.patch,
              projectionOptions(
                frame.key.attachmentId,
                frame.key.conversationId,
                frame.projectionVersion,
              ),
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

  function projectionOptions(attachmentId: string, conversationId: string, generation: number) {
    return {
      resolveContentLocator: (locator: ContentLocator, context: { readonly mediaType?: string }) =>
        resolveContentLocator(locator, context, attachmentId, conversationId, generation),
    };
  }
}

function recordProjectedResourceFacts(
  frame: ConversationProjectionAttachmentHostFrame,
  record: ((fact: DesktopAgentResourceDisplayProjectionFact) => void) | undefined,
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
  record: (fact: DesktopAgentResourceDisplayProjectionFact) => void,
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
      DesktopAgentResourceDisplayProjectionFact,
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
  const locator = isContentLocator(owner['contentLocator']) ? owner['contentLocator'] : undefined;
  if (locator && (locator.kind === 'workspace-file' || locator.kind === 'generated-output')) {
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

function contentRevision(fingerprint: ContentFingerprint, byteLength: number): string {
  return `${fingerprint.strategy}:${fingerprint.value}:${byteLength}`;
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
