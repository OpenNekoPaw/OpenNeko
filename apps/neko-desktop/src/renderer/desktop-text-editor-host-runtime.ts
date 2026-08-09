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
    subscribe: (listener) =>
      input.bridge.textEditor.subscribe(input.identity, (event) => listener(event.projection)),
  };
}
