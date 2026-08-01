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
  type ContentFingerprint,
  type ContentLocator,
} from '@neko/shared';
import type { DesktopAgentConnectionIdentity } from '../shared/agent-contract';
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
      switch (frame.type) {
        case 'projectionSnapshot':
          return {
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
        case 'projectionPatch':
          return {
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
        case 'projectionDetach':
        case 'projectionProtocolDiagnostic':
          return frame;
      }
      return assertNeverProjectionFrame(frame);
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

  function projectionOptions(
    attachmentId: string,
    conversationId: string,
    generation: number,
  ) {
    return {
      resolveContentLocator: (
        locator: ContentLocator,
        context: { readonly mediaType?: string },
      ) =>
        resolveContentLocator(
          locator,
          context,
          attachmentId,
          conversationId,
          generation,
        ),
    };
  }
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

function assertNeverProjectionFrame(frame: never): never {
  throw new Error(
    `Unsupported Desktop Agent projection frame: ${JSON.stringify(frame)}`,
  );
}
