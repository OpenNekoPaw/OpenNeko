import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { resolveProjectWorkspaceContentLocator } from '@neko/assets-node';
import { isProjectDurableContentLocator, parseContentReferenceTarget } from '@neko/content-domain';
import { projectNekoMarkdownExtensions } from '@neko/markdown';
import { detectPreviewContentKind, getPreviewMediaType } from '@neko/preview-domain';
import {
  assertPrepareTextEditorMarkdownMediaRequest,
  assertReleaseTextEditorMarkdownMediaRequest,
  assertTextEditorMarkdownMediaProjection,
  type PrepareTextEditorMarkdownMediaRequest,
  type ReleaseTextEditorMarkdownMediaRequest,
  type TextEditorMarkdownMediaDiagnosticCode,
  type TextEditorMarkdownMediaKind,
  type TextEditorMarkdownMediaProjection,
  type TextEditorMarkdownMediaToken,
} from '@neko/text-editor-domain';

export interface NodeTextEditorMarkdownMediaResourceOwner {
  readonly windowId: string;
  readonly viewId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
}

export interface NodeTextEditorMarkdownMediaResourceLease {
  readonly url: string;
  release(): void;
}

export interface NodeTextEditorMarkdownMediaResourcePort {
  registerFile(
    owner: NodeTextEditorMarkdownMediaResourceOwner,
    source: { readonly absolutePath: string; readonly mediaType: string },
  ): Promise<NodeTextEditorMarkdownMediaResourceLease>;
}

export interface NodeTextEditorMarkdownMediaServiceOptions {
  readonly resolveWorkspace: (workspaceId: string) => Promise<AssetWorkspaceResolution>;
  readonly globalMediaLibraryRoot: string;
  readonly resources: NodeTextEditorMarkdownMediaResourcePort;
  readonly createLeaseId?: () => string;
}

export interface PrepareNodeTextEditorMarkdownMediaInput {
  readonly request: PrepareTextEditorMarkdownMediaRequest;
  readonly source: string;
  readonly resourceOwner: NodeTextEditorMarkdownMediaResourceOwner;
  readonly isCurrent: () => boolean;
}

interface OwnedMediaLease {
  readonly leaseId: string;
  readonly workspaceId: string;
  readonly documentId: string;
  readonly sessionId: string;
  readonly surfaceId: string;
  readonly windowId: string;
  readonly resourceLease: NodeTextEditorMarkdownMediaResourceLease;
}

export class NodeTextEditorMarkdownMediaService {
  private readonly leases = new Map<string, OwnedMediaLease>();
  private readonly createLeaseId: () => string;
  private disposed = false;

  constructor(private readonly options: NodeTextEditorMarkdownMediaServiceOptions) {
    this.createLeaseId = options.createLeaseId ?? randomUUID;
  }

  async prepare(
    input: PrepareNodeTextEditorMarkdownMediaInput,
  ): Promise<TextEditorMarkdownMediaProjection> {
    this.requireActive();
    const { request } = input;
    assertPrepareTextEditorMarkdownMediaRequest(request);
    assertResourceOwner(request, input.resourceOwner);
    if (!input.isCurrent()) return unavailable(request, 'text-editor-markdown-media-stale-surface');
    if (!sourceContainsToken(input.source, request.token)) {
      return unavailable(request, 'text-editor-markdown-media-projection-failed');
    }

    const kind = classifyMedia(request.token.target);
    const contentType = getPreviewMediaType(request.token.target);
    if (!kind || !contentType) {
      return unavailable(request, 'text-editor-markdown-media-unsupported');
    }

    let workspace: AssetWorkspaceResolution;
    let absolutePath: string;
    try {
      workspace = await this.options.resolveWorkspace(request.identity.workspaceId);
      if (workspace.workspaceId !== request.identity.workspaceId) {
        return unavailable(request, 'text-editor-markdown-media-unauthorized');
      }
      const locator = parseContentReferenceTarget(request.token.target);
      if (!locator || !isProjectDurableContentLocator(locator)) {
        return unavailable(request, 'text-editor-markdown-media-unauthorized');
      }
      absolutePath = await resolveProjectWorkspaceContentLocator(
        {
          projectId: request.identity.owner.projectId,
          workspaceRoot: workspace.workspacePath,
          globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
        },
        locator,
      );
    } catch (error) {
      return unavailable(request, diagnosticForResolutionError(error));
    }
    if (!input.isCurrent()) return unavailable(request, 'text-editor-markdown-media-stale-surface');

    let resourceLease: NodeTextEditorMarkdownMediaResourceLease;
    try {
      resourceLease = await this.options.resources.registerFile(input.resourceOwner, {
        absolutePath,
        mediaType: contentType,
      });
    } catch {
      return unavailable(request, 'text-editor-markdown-media-projection-failed');
    }
    if (!input.isCurrent()) {
      resourceLease.release();
      return unavailable(request, 'text-editor-markdown-media-stale-surface');
    }

    const leaseId = this.createLeaseId();
    if (!leaseId || this.leases.has(leaseId)) {
      resourceLease.release();
      throw new Error('Text Editor Markdown media lease identity is invalid or duplicated.');
    }
    const projection: TextEditorMarkdownMediaProjection = {
      ...request,
      status: 'ready',
      descriptor: {
        leaseId,
        kind,
        renderUri: resourceLease.url,
        contentType,
        displayName: path.posix.basename(request.token.target),
      },
    };
    try {
      assertTextEditorMarkdownMediaProjection(request, projection);
    } catch (error) {
      resourceLease.release();
      throw error;
    }
    this.leases.set(leaseId, {
      leaseId,
      workspaceId: request.identity.workspaceId,
      documentId: request.identity.documentId,
      sessionId: request.sessionId,
      surfaceId: request.surfaceId,
      windowId: request.identity.owner.windowId,
      resourceLease,
    });
    return projection;
  }

  release(request: ReleaseTextEditorMarkdownMediaRequest): void {
    this.requireActive();
    assertReleaseTextEditorMarkdownMediaRequest(request);
    const lease = this.leases.get(request.leaseId);
    if (!lease || !releaseOwnsLease(request, lease)) {
      throw new Error('Text Editor Markdown media lease owner is stale or unavailable.');
    }
    this.releaseLease(lease);
  }

  releaseSession(sessionId: string): void {
    this.releaseWhere((lease) => lease.sessionId === sessionId);
  }

  releaseWindow(windowId: string): void {
    this.releaseWhere((lease) => lease.windowId === windowId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseWhere(() => true);
  }

  private releaseWhere(predicate: (lease: OwnedMediaLease) => boolean): void {
    for (const lease of this.leases.values()) {
      if (predicate(lease)) this.releaseLease(lease);
    }
  }

  private releaseLease(lease: OwnedMediaLease): void {
    if (!this.leases.delete(lease.leaseId)) return;
    lease.resourceLease.release();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Text Editor Markdown media service is disposed.');
  }
}

function sourceContainsToken(source: string, token: TextEditorMarkdownMediaToken): boolean {
  const projection = projectNekoMarkdownExtensions(source, { resourceReferences: 'enabled' });
  if (token.kind === 'commonmark-image') {
    return projection.images.some(
      (image) =>
        image.range.startOffset === token.from &&
        image.range.endOffset === token.to &&
        image.lookupToken === token.target &&
        image.altText === (token.altText ?? ''),
    );
  }
  return projection.resourceReferences.some(
    (resource) =>
      resource.embed &&
      resource.range.startOffset === token.from &&
      resource.range.endOffset === token.to &&
      resource.lookupToken === token.target,
  );
}

function classifyMedia(target: string): TextEditorMarkdownMediaKind | undefined {
  const kind = detectPreviewContentKind(target);
  return kind === 'image' || kind === 'audio' || kind === 'video' ? kind : undefined;
}

function diagnosticForResolutionError(error: unknown): TextEditorMarkdownMediaDiagnosticCode {
  if (
    isErrorCode(error, 'ENOENT') ||
    isErrorCode(error, 'ENOTDIR') ||
    isErrorCode(error, 'workspace-path-unavailable') ||
    isErrorCode(error, 'library-link-broken') ||
    isErrorCode(error, 'library-link-loop') ||
    isErrorCode(error, 'content-missing')
  ) {
    return 'text-editor-markdown-media-missing';
  }
  if (
    isErrorCode(error, 'EACCES') ||
    isErrorCode(error, 'EPERM') ||
    isErrorCode(error, 'invalid-workspace-path') ||
    isErrorCode(error, 'library-permission-denied') ||
    isErrorCode(error, 'library-entry-not-link') ||
    isErrorCode(error, 'unmanaged-symlink') ||
    isErrorCode(error, 'nested-link-escape') ||
    isErrorCode(error, 'content-unauthorized')
  ) {
    return 'text-editor-markdown-media-unauthorized';
  }
  return 'text-editor-markdown-media-projection-failed';
}

function unavailable(
  request: PrepareTextEditorMarkdownMediaRequest,
  code: TextEditorMarkdownMediaDiagnosticCode,
): TextEditorMarkdownMediaProjection {
  return { ...request, status: 'unavailable', diagnostic: { code } };
}

function assertResourceOwner(
  request: PrepareTextEditorMarkdownMediaRequest,
  owner: NodeTextEditorMarkdownMediaResourceOwner,
): void {
  if (
    owner.windowId !== request.identity.owner.windowId ||
    owner.sessionId !== request.sessionId ||
    !owner.viewId ||
    !owner.rendererSessionId
  ) {
    throw new Error('Text Editor Markdown media resource owner does not match its request.');
  }
}

function releaseOwnsLease(
  request: ReleaseTextEditorMarkdownMediaRequest,
  lease: OwnedMediaLease,
): boolean {
  return (
    lease.workspaceId === request.identity.workspaceId &&
    lease.documentId === request.identity.documentId &&
    lease.sessionId === request.sessionId &&
    lease.surfaceId === request.surfaceId &&
    lease.windowId === request.identity.owner.windowId
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}
