import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  AgentScratchArtifactRef,
  AssistantResourceIdentity,
} from '@neko/agent-contracts';
import type { AssistantResourcePreviewPort } from '@neko/agent-runtime/application';
import {
  AUTHORIZED_PREVIEW_SESSION_VERSION,
  parseAuthorizedPreviewSessionProjection,
  type AuthorizedPreviewSessionProjection,
} from '@neko/preview-domain/authorized-session';
import { detectPreviewContentKind, getPreviewMediaType } from '@neko/preview-domain';
import type { DesktopResourceRegistry } from './desktop-resource-registry';

interface AssistantPreviewEntry {
  readonly identity: AssistantResourceIdentity;
  readonly endpointEpoch: string;
  readonly projection: AuthorizedPreviewSessionProjection;
}

export interface DesktopAssistantPreviewRuntime extends AssistantResourcePreviewPort {
  detachWindow(windowId: string): void;
  dispose(): void;
}

export function createDesktopAssistantPreviewRuntime(options: {
  readonly resolveScratchRoot: (ref: AgentScratchArtifactRef) => string;
  readonly resources: Pick<DesktopResourceRegistry, 'registerFile' | 'releaseSession'>;
  readonly createIdentity?: () => string;
}): DesktopAssistantPreviewRuntime {
  const createIdentity = options.createIdentity ?? randomUUID;
  const previews = new Map<string, AssistantPreviewEntry>();
  let disposed = false;
  const requireActive = (): void => {
    if (disposed) throw new Error('Desktop Assistant Preview runtime is disposed.');
  };
  const requirePreview = (input: {
    readonly identity: AssistantResourceIdentity;
    readonly endpointEpoch: string;
    readonly previewSessionId: string;
  }): AssistantPreviewEntry => {
    requireActive();
    const entry = previews.get(input.previewSessionId);
    if (
      !entry ||
      entry.endpointEpoch !== input.endpointEpoch ||
      !sameAssistantResourceIdentity(entry.identity, input.identity)
    ) {
      throw new Error(
        `Assistant Preview session '${input.previewSessionId}' does not match its owner.`,
      );
    }
    return entry;
  };
  const runtime: DesktopAssistantPreviewRuntime = {
    async authorize({ identity, endpointEpoch, artifact }) {
      requireActive();
      if (
        artifact.assistantSpaceId !== identity.assistantSpaceId ||
        artifact.conversationId !== identity.conversationId
      ) {
        throw new Error('Assistant Scratch artifact does not match its Preview owner.');
      }
      const previewSessionId = `preview:assistant:${createIdentity()}`;
      const owner = {
        kind: 'assistant-scratch' as const,
        assistantSpaceId: identity.assistantSpaceId,
        conversationId: identity.conversationId,
        scratchArtifactId: artifact.scratchArtifactId,
      };
      const contentKind = detectPreviewContentKind(artifact.label);
      const mediaType = getPreviewMediaType(artifact.label);
      let projection: AuthorizedPreviewSessionProjection;
      if (!contentKind || !mediaType) {
        projection = parseAuthorizedPreviewSessionProjection({
          schemaVersion: AUTHORIZED_PREVIEW_SESSION_VERSION,
          identity: { previewSessionId, windowId: identity.windowId, owner, revision: 0 },
          status: 'unavailable',
          diagnostic: {
            code: 'preview-unsupported-kind',
            message: `Preview does not support '${artifact.label}'.`,
          },
        });
      } else {
        const absolutePath = await resolveScratchFile(options.resolveScratchRoot(artifact), artifact.label);
        const file = await stat(absolutePath);
        if (!file.isFile()) throw new Error('Assistant Scratch Preview source is not a file.');
        const bytes = await readFile(absolutePath);
        const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        const revision = `${file.mtimeMs}:${file.size}`;
        const lease = await options.resources.registerFile(
          {
            windowId: identity.windowId,
            viewId: identity.assistantSpaceId,
            sessionId: previewSessionId,
            endpointEpoch,
            revision,
            generation: '0',
          },
          { absolutePath, mediaType, revision },
        );
        projection = parseAuthorizedPreviewSessionProjection({
          schemaVersion: AUTHORIZED_PREVIEW_SESSION_VERSION,
          identity: { previewSessionId, windowId: identity.windowId, owner, revision: 0 },
          status: 'ready',
          descriptor: {
            descriptorId: `descriptor:${previewSessionId}`,
            revision,
            contentLocator: {
              kind: 'generated-output',
              outputId: artifact.scratchArtifactId,
              revision,
              digest,
              path: artifact.label,
            },
            url: lease.url,
            contentKind,
            mediaType,
            displayName: artifact.label,
            byteLength: file.size,
          },
        });
      }
      for (const [existingId, existing] of previews) {
        if (!sameAssistantResourceIdentity(existing.identity, identity)) continue;
        previews.delete(existingId);
        options.resources.releaseSession(existingId);
      }
      previews.set(previewSessionId, { identity, endpointEpoch, projection });
      return projection;
    },
    read(input) {
      return requirePreview(input).projection;
    },
    release(input) {
      const entry = requirePreview(input);
      previews.delete(entry.projection.identity.previewSessionId);
      options.resources.releaseSession(entry.projection.identity.previewSessionId);
    },
    detachWindow(windowId) {
      requireActive();
      for (const [previewSessionId, entry] of previews) {
        if (entry.identity.windowId !== windowId) continue;
        previews.delete(previewSessionId);
        options.resources.releaseSession(previewSessionId);
      }
    },
    dispose() {
      if (disposed) return;
      for (const previewSessionId of previews.keys()) options.resources.releaseSession(previewSessionId);
      previews.clear();
      disposed = true;
    },
  };
  return Object.freeze(runtime);
}

async function resolveScratchFile(rootValue: string, label: string): Promise<string> {
  if (path.basename(label) !== label || label === '.' || label === '..') {
    throw new Error('Assistant Scratch Preview label must be a single managed filename.');
  }
  const root = await realpath(rootValue);
  const target = await realpath(path.join(root, label));
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Assistant Scratch Preview source escapes its conversation-owned root.');
  }
  return target;
}

function sameAssistantResourceIdentity(
  left: AssistantResourceIdentity,
  right: AssistantResourceIdentity,
): boolean {
  return (
    left.assistantSpaceId === right.assistantSpaceId &&
    left.conversationId === right.conversationId &&
    left.windowId === right.windowId
  );
}
