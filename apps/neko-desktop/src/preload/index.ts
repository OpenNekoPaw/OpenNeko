import { contextBridge, ipcRenderer } from 'electron';
import {
  createDesktopBootstrapRequest,
  DESKTOP_BRIDGE_CHANNELS,
  parseDesktopBootstrapProjection,
  parseDesktopLifecycleEvent,
  type DesktopLifecycleEvent,
  type OpenNekoDesktopBridge,
} from '../shared/bridge-contract';
import {
  createDesktopProfileRequest,
  createDesktopShellRequest,
  createDesktopTabMutationRequest,
  createDesktopWindowMutationRequest,
  DESKTOP_SHELL_CHANNELS,
  parseDesktopOpenContentResult,
  parseDesktopProfileRequestResult,
  parseDesktopShellProjectionEvent,
  parseDesktopShellResponse,
  type DesktopShellProjectionEvent,
  type OpenNekoDesktopShellBridge,
} from '../shared/shell-contract';
import {
  advanceDesktopShellProjectionCursor,
  type DesktopShellProjectionCursor,
} from '../shared/projection-revision';

let requestSequence = 0;
let latestShellProjection: DesktopShellProjectionCursor | undefined;

const bridge: OpenNekoDesktopBridge & OpenNekoDesktopShellBridge = {
  bootstrap: {
    async get() {
      requestSequence += 1;
      const requestId = `desktop-bootstrap-${Date.now()}-${requestSequence}`;
      const request = createDesktopBootstrapRequest(requestId);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
        request,
      );
      return parseDesktopBootstrapProjection(response, requestId);
    },
  },
  lifecycle: {
    subscribe(listener: (event: DesktopLifecycleEvent) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        listener(parseDesktopLifecycleEvent(value));
      };
      ipcRenderer.on(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, handler);
      };
    },
  },
  shell: {
    async getSnapshot() {
      const request = createDesktopShellRequest(nextRequestId('desktop-shell-snapshot'));
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.snapshotGet,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    subscribe(listener: (event: DesktopShellProjectionEvent) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        const event = parseDesktopShellProjectionEvent(value);
        rememberShellProjection(event.projection);
        listener(event);
      };
      ipcRenderer.on(DESKTOP_SHELL_CHANNELS.projectionEvent, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_SHELL_CHANNELS.projectionEvent, handler);
      };
    },
  },
  projects: {
    async openContent() {
      const context = requireShellMutationContext();
      const request = createDesktopWindowMutationRequest(
        nextRequestId('desktop-project-open'),
        context.endpointEpoch,
        context.windowRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectOpenContent,
        request,
      );
      const result = parseDesktopOpenContentResult(response, request.requestId);
      rememberShellProjection(result.projection);
      return result;
    },
    async requestProfile(profile) {
      const request = createDesktopProfileRequest(
        nextRequestId('desktop-project-profile'),
        profile,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectRequestProfile,
        request,
      );
      const result = parseDesktopProfileRequestResult(response, request.requestId);
      rememberShellProjection(result.projection);
      return result;
    },
  },
  tabs: {
    async activateHome(expectedWindowRevision) {
      const context = requireShellMutationContext();
      const request = createDesktopTabMutationRequest(
        nextRequestId('desktop-home-activate'),
        'home',
        context.endpointEpoch,
        expectedWindowRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.homeActivate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async activate(tabId, expectedWindowRevision) {
      const context = requireShellMutationContext();
      const request = createDesktopTabMutationRequest(
        nextRequestId('desktop-tab-activate'),
        tabId,
        context.endpointEpoch,
        expectedWindowRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.tabActivate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async close(tabId, expectedWindowRevision) {
      const context = requireShellMutationContext();
      const request = createDesktopTabMutationRequest(
        nextRequestId('desktop-tab-close'),
        tabId,
        context.endpointEpoch,
        expectedWindowRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.tabClose,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
};

contextBridge.exposeInMainWorld('openNekoDesktop', bridge);

function nextRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}-${Date.now()}-${requestSequence}`;
}

function rememberShellProjection<T extends {
  readonly endpointEpoch: string;
  readonly projectionRevision: number;
  readonly window: { readonly revision: number };
}>(projection: T): T {
  latestShellProjection = advanceDesktopShellProjectionCursor(
    latestShellProjection,
    projection,
  );
  return projection;
}

function requireShellMutationContext(): {
  readonly endpointEpoch: string;
  readonly windowRevision: number;
} {
  if (!latestShellProjection) {
    throw new Error('Desktop Shell mutation requires an authoritative snapshot.');
  }
  return latestShellProjection;
}
