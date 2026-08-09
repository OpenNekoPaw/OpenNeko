import { TEXT_EDITOR_HOST_ROUTES, type TextEditorRuntimeIdentity } from '@neko/text-editor-domain';
import type { TextEditorHostRuntime } from '@neko/text-editor-webview/host-adapter';
import type { OpenNekoDesktopTextEditorBridge } from '@neko/text-editor-domain';

export function createElectronTextEditorHostRuntime(input: {
  readonly bridge: OpenNekoDesktopTextEditorBridge;
  readonly identity: TextEditorRuntimeIdentity;
}): TextEditorHostRuntime {
  let requestSequence = 0;
  const execute = async (
    request: Parameters<OpenNekoDesktopTextEditorBridge['textEditor']['execute']>[0],
  ) => {
    const result = await input.bridge.textEditor.execute(request);
    if (result.status === 'rejected') throw new Error(result.diagnostic.code);
    if (result.status !== 'ready') {
      throw new Error(`Text Editor request returned '${result.status}'.`);
    }
    return result.projection;
  };
  const requestId = (operation: string): string => {
    requestSequence += 1;
    return `desktop-text-editor:${operation}:${requestSequence}`;
  };
  return {
    project: () =>
      execute({
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: requestId('projection'),
        identity: input.identity,
      }),
    applyEdits: (command) => {
      if (command.sessionId !== input.identity.sessionId) {
        throw new Error('Text Editor command session identity is stale.');
      }
      return execute({
        route: TEXT_EDITOR_HOST_ROUTES.editsApply,
        requestId: command.requestId,
        identity: input.identity,
        expectedEditSequence: command.expectedEditSequence,
        changes: command.changes,
      });
    },
    formatJson: (request) =>
      execute({
        route: TEXT_EDITOR_HOST_ROUTES.jsonFormat,
        requestId: request.requestId,
        identity: input.identity,
        expectedEditSequence: request.expectedEditSequence,
      }),
    save: (request) =>
      execute({
        route: TEXT_EDITOR_HOST_ROUTES.save,
        requestId: requestId('save'),
        identity: input.identity,
        expectedEditSequence: request.expectedEditSequence,
      }),
    reload: (request) => {
      if (request.sessionId !== input.identity.sessionId) {
        throw new Error('Text Editor command session identity is stale.');
      }
      return execute({
        route: TEXT_EDITOR_HOST_ROUTES.reload,
        requestId: requestId('reload'),
        identity: input.identity,
        confirmDirty: request.confirmDirty,
      });
    },
    searchMarkdownReferences: async (request, signal) => {
      if (signal.aborted) return { status: 'discarded', reason: 'cancelled' };
      const result = await input.bridge.textEditor.execute({
        route: TEXT_EDITOR_HOST_ROUTES.referencesSearch,
        requestId: request.requestId,
        identity: {
          ...input.identity,
          projectId: request.identity.owner.projectId,
          workspaceId: request.identity.workspaceId,
          windowId: request.identity.owner.windowId,
          documentId: request.identity.documentId,
          sessionId: request.sessionId,
        },
        search: request,
      });
      if (signal.aborted) return { status: 'discarded', reason: 'cancelled' };
      if (result.status === 'references-ready') {
        return { status: 'ready', projection: result.projection };
      }
      if (result.status === 'references-discarded') {
        return { status: 'discarded', reason: result.reason };
      }
      if (result.status === 'rejected') throw new Error(result.diagnostic.code);
      throw new Error(`Text Editor reference search returned '${result.status}'.`);
    },
    prepareMarkdownMedia: async (request, signal) => {
      if (signal.aborted) {
        return {
          ...request,
          status: 'unavailable',
          diagnostic: { code: 'text-editor-markdown-media-stale-surface' },
        };
      }
      const result = await input.bridge.textEditor.execute({
        route: TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
        requestId: request.requestId,
        identity: runtimeIdentityForDocument(input.identity, request),
        media: request,
      });
      if (result.status !== 'media-ready') {
        if (result.status === 'rejected') throw new Error(result.diagnostic.code);
        throw new Error(`Text Editor media preparation returned '${result.status}'.`);
      }
      if (signal.aborted && result.projection.status === 'ready') {
        const releaseId = requestId('release-stale-media');
        const released = await input.bridge.textEditor.execute({
          route: TEXT_EDITOR_HOST_ROUTES.mediaRelease,
          requestId: releaseId,
          identity: result.identity,
          media: {
            requestId: releaseId,
            identity: request.identity,
            sessionId: request.sessionId,
            surfaceId: request.surfaceId,
            leaseId: result.projection.descriptor.leaseId,
          },
        });
        if (released.status !== 'media-released') {
          throw new Error(`Text Editor stale media release returned '${released.status}'.`);
        }
        return {
          ...request,
          status: 'unavailable',
          diagnostic: { code: 'text-editor-markdown-media-stale-surface' },
        };
      }
      return result.projection;
    },
    releaseMarkdownMedia: async (request) => {
      const result = await input.bridge.textEditor.execute({
        route: TEXT_EDITOR_HOST_ROUTES.mediaRelease,
        requestId: request.requestId,
        identity: runtimeIdentityForDocument(input.identity, request),
        media: request,
      });
      if (
        result.status !== 'media-released' ||
        result.surfaceId !== request.surfaceId ||
        result.leaseId !== request.leaseId
      ) {
        if (result.status === 'rejected') throw new Error(result.diagnostic.code);
        throw new Error(`Text Editor media release returned '${result.status}'.`);
      }
    },
    subscribe: (listener) =>
      input.bridge.textEditor.subscribe(input.identity, (event) => listener(event.projection)),
  };
}

function runtimeIdentityForDocument(
  current: TextEditorRuntimeIdentity,
  request: {
    readonly identity: import('@neko/text-editor-domain').TextDocumentIdentity;
    readonly sessionId: string;
  },
): TextEditorRuntimeIdentity {
  if (request.identity.owner.kind !== 'window') {
    throw new Error('Text Editor media owner must be a Window.');
  }
  return {
    ...current,
    projectId: request.identity.owner.projectId,
    workspaceId: request.identity.workspaceId,
    windowId: request.identity.owner.windowId,
    documentId: request.identity.documentId,
    sessionId: request.sessionId,
  };
}
