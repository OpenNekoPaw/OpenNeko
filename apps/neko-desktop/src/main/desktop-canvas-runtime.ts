import { randomUUID } from 'node:crypto';
import {
  CanvasHostRuntimeSession,
  parseCanvasHostIntentRequest,
  projectContentLocatorToCanvas,
  type CanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
} from '@neko-canvas/domain';
import type { NekoHostPorts } from '@neko/host/ports';
import {
  CANVAS_VERSION,
  loadNkc,
  saveNkc,
  type CanvasData,
  type ContentLocator,
} from '@neko/shared';
import type { DesktopCanvasViewGrant } from './shell-service';
import { resolveDesktopWorkspaceContentLocator } from './desktop-content-locator';
import {
  parseDesktopCanvasPreviewVariantRequest,
  type DesktopCanvasPreviewVariantRequest,
  type DesktopCanvasPreviewVariantResult,
} from '../shared/canvas-bridge-contract';

export interface DesktopCanvasShellPort {
  resolveCanvasViewGrant(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasViewGrant>;
}

interface DesktopCanvasSessionEntry {
  readonly windowId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly documentPath: string;
  readonly workspace: DesktopCanvasViewGrant['workspace'];
  readonly session: CanvasHostRuntimeSession;
}

export class DesktopCanvasRuntime {
  private readonly sessions = new Map<string, DesktopCanvasSessionEntry>();
  private disposed = false;

  constructor(
    private readonly options: {
      readonly shell: DesktopCanvasShellPort;
      readonly host: NekoHostPorts;
      readonly requestSource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly sourceKind: 'image' | 'video' | 'audio' | 'document' | 'canvas';
        readonly workspace: DesktopCanvasViewGrant['workspace'];
      }) => Promise<ContentLocator | undefined>;
      readonly previewResource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly locator: ContentLocator;
        readonly absolutePath: string;
      }) => Promise<void>;
      readonly createPreviewVariant?: (input: {
        readonly absolutePath: string;
        readonly mediaType?: string;
      }) => Promise<string>;
    },
  ) {}

  async getSnapshot(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<CanvasHostSnapshot> {
    return (await this.requireSession(windowId, identity)).session.getSnapshot();
  }

  async executeIntent(
    windowId: string,
    payload: CanvasHostIntentRequest | unknown,
  ): Promise<CanvasHostIntentResult> {
    const request = parseCanvasHostIntentRequest(payload);
    return (await this.requireSession(windowId, request.identity)).session.executeIntent(request);
  }

  async resolvePreviewVariant(
    windowId: string,
    value: DesktopCanvasPreviewVariantRequest | unknown,
  ): Promise<DesktopCanvasPreviewVariantResult> {
    const request = parseDesktopCanvasPreviewVariantRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    const createPreviewVariant = this.options.createPreviewVariant;
    if (!createPreviewVariant) {
      throw new Error('Desktop Canvas preview variant capability is unavailable.');
    }
    const absolutePath = await resolveDesktopWorkspaceContentLocator(
      entry.workspace,
      request.locator,
    );
    return {
      requestId: request.requestId,
      url: await createPreviewVariant({
        absolutePath,
        ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
      }),
    };
  }

  async subscribe(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
    listener: (event: CanvasHostProjectionEvent) => void,
  ): Promise<() => void> {
    return (await this.requireSession(windowId, identity)).session.subscribe(listener);
  }

  detachWindow(windowId: string): void {
    for (const [key, entry] of this.sessions) {
      if (entry.windowId !== windowId) continue;
      entry.session.dispose();
      this.sessions.delete(key);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.sessions.values()) entry.session.dispose();
    this.sessions.clear();
  }

  private async requireSession(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasSessionEntry> {
    this.requireActive();
    const grant = await this.options.shell.resolveCanvasViewGrant(windowId, identity);
    const key = sessionKey(identity);
    const existing = this.sessions.get(key);
    if (existing) return existing;
    const documentPath =
      identity.documentId === 'neko/boards/workspace.nkc'
        ? this.options.host.paths.join(grant.workspace.workspacePath, identity.documentId)
        : await resolveDesktopWorkspaceContentLocator(grant.workspace, {
            kind: 'workspace-file',
            path: identity.documentId,
          });
    const initialCanvas = await this.loadDocument(documentPath, grant.workspace.displayName);
    const requestSource = this.options.requestSource;
    const previewResource = this.options.previewResource;
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      effects: {
        saveDocument: async ({ canvas }) => {
          await this.saveDocument(documentPath, canvas);
        },
        projectContent: async ({ canvas, locator, position }) => {
          await resolveDesktopWorkspaceContentLocator(grant.workspace, locator);
          return projectContentLocatorToCanvas({
            canvas,
            locator,
            ...(position ? { position } : {}),
          });
        },
        requestSource: requestSource
          ? ({ identity: requestIdentity, sourceKind }) =>
              requestSource({
                identity: requestIdentity,
                sourceKind,
                workspace: grant.workspace,
              })
          : undefined,
        previewResource: previewResource
          ? async ({ identity: requestIdentity, locator }) => {
              const absolutePath = await resolveDesktopWorkspaceContentLocator(
                grant.workspace,
                locator,
              );
              await previewResource({
                identity: requestIdentity,
                locator,
                absolutePath,
              });
            }
          : undefined,
        revealResource: async ({ locator }) => {
          const absolutePath = await resolveDesktopWorkspaceContentLocator(
            grant.workspace,
            locator,
          );
          const revealPath = this.options.host.external?.revealPath;
          if (!revealPath) {
            throw new Error('Desktop Canvas reveal capability is unavailable.');
          }
          await revealPath(absolutePath);
        },
      },
    });
    const entry: DesktopCanvasSessionEntry = {
      windowId,
      identity: { ...identity },
      documentPath,
      workspace: grant.workspace,
      session,
    };
    this.sessions.set(key, entry);
    return entry;
  }

  private async loadDocument(documentPath: string, workspaceName: string): Promise<CanvasData> {
    try {
      const stat = await this.options.host.files.stat(documentPath);
      if (stat.type !== 'file') {
        throw new Error('Desktop Canvas document is not a file.');
      }
    } catch (error: unknown) {
      if (isFileNotFound(error)) {
        return {
          version: CANVAS_VERSION,
          name: `${workspaceName} Canvas`,
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          nodes: [],
          connections: [],
        };
      }
      throw error;
    }
    const loaded = loadNkc(await this.options.host.files.readText(documentPath));
    if (!loaded.validation.valid) {
      throw new Error('Desktop Canvas document is invalid.');
    }
    return loaded.data;
  }

  private async saveDocument(documentPath: string, canvas: CanvasData): Promise<void> {
    const directory = this.options.host.paths.dirname(documentPath);
    await this.options.host.files.createDirectory(directory);
    const temporaryPath = `${documentPath}.${randomUUID()}.tmp`;
    try {
      await this.options.host.files.writeText(temporaryPath, saveNkc(canvas));
      await this.options.host.files.rename(temporaryPath, documentPath);
    } catch (error: unknown) {
      await this.options.host.files
        .delete(temporaryPath, { idempotent: true })
        .catch(() => undefined);
      throw error;
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Canvas runtime is disposed.');
  }
}

function sessionKey(identity: CanvasHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
