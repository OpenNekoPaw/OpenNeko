import { contextBridge, ipcRenderer } from 'electron';
import {
  createDesktopAgentBootstrapRequest,
  createDesktopAgentMessageRequest,
  DESKTOP_AGENT_CHANNELS,
  DesktopAgentContractError,
  parseDesktopAgentBootstrapProjection,
  parseDesktopAgentMessageEvent,
  parseDesktopAgentMessageResult,
  type OpenNekoDesktopAgentBridge,
} from '../shared/agent-contract';
import {
  createDesktopAgentAutomationRequest,
  DESKTOP_AGENT_AUTOMATION_CHANNEL,
  parseDesktopAgentAutomationResult,
  type OpenNekoDesktopAgentAutomationBridge,
} from '../shared/agent-automation-contract';
import {
  createDesktopBootstrapRequest,
  DESKTOP_BRIDGE_CHANNELS,
  parseDesktopBootstrapProjection,
  parseDesktopLifecycleEvent,
  type DesktopLifecycleEvent,
  type OpenNekoDesktopBridge,
} from '../shared/bridge-contract';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProfileRequest,
  createDesktopProjectOpenRequest,
  createDesktopProjectRemoveRecentRequest,
  createDesktopShellRequest,
  createDesktopTabMutationRequest,
  createDesktopWindowMutationRequest,
  createDesktopWorkbenchMutationRequest,
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
import {
  advanceDesktopAgentBootstrapCursor,
  isSameDesktopAgentEventConnection,
  projectDesktopAgentSendFailure,
  type DesktopAgentEventCursor,
} from './desktop-agent-event-cursor';
import { preserveDesktopBootstrapEventSequence } from './desktop-runtime-event-cursor';
import {
  parseResourceBrowserChildrenRequest,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserQuickPreviewReleaseRequest,
  parseResourceBrowserQuickPreviewReleaseResult,
  parseResourceBrowserQuickPreviewRequest,
  parseResourceBrowserQuickPreviewResult,
  parseResourceBrowserRecoveryApplyRequest,
  parseResourceBrowserRecoveryCancelRequest,
  parseResourceBrowserRecoveryCancelResult,
  parseResourceBrowserRecoveryPlanRequest,
  parseResourceBrowserRecoveryPlanResult,
  parseResourceBrowserProjection,
  parseResourceBrowserProjectionEvent,
  parseResourceBrowserSearchRequest,
  parseResourceBrowserSnapshotRequest,
  parseResourceBrowserThumbnailRequest,
  parseResourceBrowserThumbnailResult,
  type ResourceBrowserIdentity,
} from 'neko-assets/resource-browser/contract';
import {
  DESKTOP_RESOURCE_BROWSER_CHANNELS,
  isSameResourceBrowserIdentity,
  type OpenNekoDesktopResourceBrowserBridge,
} from '../shared/resource-browser-bridge-contract';
import {
  DESKTOP_PREVIEW_CHANNELS,
  parseDesktopPreviewBootstrapRequest,
  parseDesktopPreviewProjection,
  parseDesktopPreviewRuntimeRequest,
  type OpenNekoDesktopPreviewBridge,
} from '../shared/preview-bridge-contract';
import type { PreviewRuntimeIdentity } from '@neko-preview/contracts';
import {
  parseCanvasHostIntentRequest,
  parseCanvasHostIntentResult,
  parseCanvasMaterialActionResolution,
  parseCanvasMaterialActionResolutionRequest,
  parseCanvasHostProjectionEvent,
  parseCanvasHostSnapshot,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntimeIdentity,
} from '@neko-canvas/domain';
import {
  DESKTOP_CANVAS_CHANNELS,
  isSameCanvasHostIdentity,
  parseDesktopCanvasHostIdentity,
  parseDesktopCanvasMediaRequest,
  parseDesktopCanvasMediaResponse,
  parseDesktopCanvasPreviewVariantRequest,
  parseDesktopCanvasPreviewVariantResult,
  type OpenNekoDesktopCanvasBridge,
} from '../shared/canvas-bridge-contract';
import {
  parseCutHostRuntimeProjectionEvent,
  parseCutHostRuntimeRequest,
  parseCutHostRuntimeResult,
  parseCutHostRuntimeSnapshot,
  type CutHostRuntimeIdentity,
} from '@neko-cut/domain';
import {
  DESKTOP_CUT_CHANNELS,
  isSameCutHostIdentity,
  parseDesktopCutHostIdentity,
  type OpenNekoDesktopCutBridge,
} from '../shared/cut-bridge-contract';
import {
  createDesktopHomeAssetImportRequest,
  createDesktopHomeAssetRemoveRequest,
  createDesktopHomeAssetSearchRequest,
  createDesktopHomeLibraryThumbnailRequest,
  createDesktopHomeMediaLibraryAddRequest,
  createDesktopHomeMediaLibraryChildrenRequest,
  createDesktopHomeMediaLibraryRequest,
  createDesktopHomeMediaLibrarySearchRequest,
  createDesktopHomeCatalogMutationRequest,
  createDesktopHomeExtensionsRequest,
  createDesktopHomePersonalSkillRemoveRequest,
  createDesktopHomePluginMutationRequest,
  DESKTOP_HOME_MANAGEMENT_CHANNELS,
  parseDesktopHomeAssetImportResult,
  parseDesktopHomeAssetRemoveResult,
  parseDesktopHomeAssetSearchResult,
  parseDesktopHomeLibraryThumbnailResult,
  parseDesktopHomeMediaLibraryAddResult,
  parseDesktopHomeMediaLibraryChildrenResult,
  parseDesktopHomeMediaLibraryRelinkResult,
  parseDesktopHomeMediaLibraryRemoveResult,
  parseDesktopHomeMediaLibraryRevealResult,
  parseDesktopHomeMediaLibrarySearchResult,
  parseDesktopHomeExtensionMutationResult,
  parseDesktopHomeExtensionsResult,
  type OpenNekoDesktopHomeManagementBridge,
} from '../shared/home-management-contract';
import {
  createDesktopApplicationSettingsRequest,
  createDesktopApplicationSettingsUpdateRequest,
  DESKTOP_APPLICATION_SETTINGS_CHANNELS,
  DesktopApplicationSettingsContractError,
  parseDesktopAgentAdvancedSettingsResult,
  parseDesktopApplicationSettingsProjectionEvent,
  parseDesktopApplicationSettingsResponse,
  type DesktopApplicationSettingsProjection,
  type OpenNekoDesktopApplicationSettingsBridge,
} from '../shared/application-settings-contract';
import {
  DESKTOP_PROJECT_PORTABILITY_CHANNELS,
  isSameDesktopProjectPortabilityIdentity,
  parseDesktopProjectPortabilityCancelResult,
  parseDesktopProjectPortabilityExecuteRequest,
  parseDesktopProjectPortabilityExecuteResult,
  parseDesktopProjectPortabilityInspectResult,
  parseDesktopProjectPortabilityPlanResult,
  parseDesktopProjectPortabilityProgressEvent,
  parseDesktopProjectPortabilityRequest,
  parseDesktopProjectPortabilityResumeRequest,
  type DesktopProjectPortabilityIdentity,
  type OpenNekoDesktopProjectPortabilityBridge,
} from '../shared/project-portability-contract';

let requestSequence = 0;
let currentDesktopEndpointEpoch: string | undefined;
let latestShellProjection: DesktopShellProjectionCursor | undefined;
let currentAgentEventCursor: DesktopAgentEventCursor | undefined;
const agentListeners = new Set<Parameters<OpenNekoDesktopAgentBridge['agent']['subscribe']>[0]>();
let currentResourceIdentity: ResourceBrowserIdentity | undefined;
let currentResourceEventSequence = 0;
const resourceListeners = new Set<
  Parameters<OpenNekoDesktopResourceBrowserBridge['resources']['subscribe']>[0]
>();
let currentProjectPortabilityIdentity: DesktopProjectPortabilityIdentity | undefined;
const projectPortabilityEventSequences = new Map<string, number>();
const projectPortabilityListeners = new Set<
  Parameters<OpenNekoDesktopProjectPortabilityBridge['projectPortability']['subscribe']>[0]
>();
const currentPreviewIdentities = new Map<string, PreviewRuntimeIdentity>();
const currentCanvasIdentities = new Map<string, CanvasHostRuntimeIdentity>();
const currentCanvasEventSequences = new Map<string, number>();
const canvasListeners = new Set<{
  readonly identity: CanvasHostRuntimeIdentity;
  readonly listener: Parameters<OpenNekoDesktopCanvasBridge['canvas']['subscribe']>[1];
}>();
const currentCutIdentities = new Map<string, CutHostRuntimeIdentity>();
const currentCutEventSequences = new Map<string, number>();
const cutListeners = new Set<{
  readonly identity: CutHostRuntimeIdentity;
  readonly listener: Parameters<OpenNekoDesktopCutBridge['cut']['subscribe']>[1];
}>();
let currentSettingsProjection: DesktopApplicationSettingsProjection | undefined;
const settingsListeners = new Set<
  Parameters<OpenNekoDesktopApplicationSettingsBridge['settings']['subscribe']>[0]
>();

const bridge: OpenNekoDesktopBridge &
  OpenNekoDesktopShellBridge &
  OpenNekoDesktopAgentBridge &
  OpenNekoDesktopAgentAutomationBridge &
  OpenNekoDesktopResourceBrowserBridge &
  OpenNekoDesktopPreviewBridge &
  OpenNekoDesktopCanvasBridge &
  OpenNekoDesktopCutBridge &
  OpenNekoDesktopHomeManagementBridge &
  OpenNekoDesktopApplicationSettingsBridge &
  OpenNekoDesktopProjectPortabilityBridge = {
  agent: {
    async getBootstrap(projectId, viewId, viewEpoch) {
      const request = createDesktopAgentBootstrapRequest(
        nextRequestId('desktop-agent-bootstrap'),
        projectId,
        viewId,
        viewEpoch,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AGENT_CHANNELS.bootstrapGet,
        request,
      );
      const projection = parseDesktopAgentBootstrapProjection(response, request.requestId);
      currentAgentEventCursor =
        projection.status === 'ready'
          ? advanceDesktopAgentBootstrapCursor(currentAgentEventCursor, projection.connection)
          : undefined;
      return projection;
    },
    send(message) {
      const connection = currentAgentEventCursor?.connection;
      if (!connection) {
        throw new DesktopAgentContractError(
          'desktop-agent-identity-mismatch',
          'Desktop Agent send requires a ready sender-bound bootstrap.',
        );
      }
      const request = createDesktopAgentMessageRequest(
        nextRequestId('desktop-agent-message'),
        connection,
        message,
      );
      void ipcRenderer
        .invoke(DESKTOP_AGENT_CHANNELS.messageSend, request)
        .then((response: unknown) => {
          const result = parseDesktopAgentMessageResult(response, request.requestId);
          if (result.status === 'unavailable') {
            emitAgentMessage(projectDesktopAgentSendFailure(message, result.diagnostic.message));
          }
        })
        .catch((error: unknown) => {
          emitAgentMessage(projectDesktopAgentSendFailure(message, describeError(error)));
        });
    },
    subscribe(listener) {
      agentListeners.add(listener);
      return () => {
        agentListeners.delete(listener);
      };
    },
    ...(process.argv.includes('--openneko-functional-fixture')
      ? {
          automation: {
            async execute(operation) {
              const connection = currentAgentEventCursor?.connection;
              if (!connection) {
                throw new DesktopAgentContractError(
                  'desktop-agent-identity-mismatch',
                  'Desktop Agent automation requires a ready sender-bound bootstrap.',
                );
              }
              const request = createDesktopAgentAutomationRequest(
                nextRequestId('desktop-agent-automation'),
                connection,
                operation,
              );
              const response: unknown = await ipcRenderer.invoke(
                DESKTOP_AGENT_AUTOMATION_CHANNEL,
                request,
              );
              return parseDesktopAgentAutomationResult(response, request.requestId);
            },
          },
        }
      : {}),
  },
  bootstrap: {
    async get() {
      requestSequence += 1;
      const requestId = `desktop-bootstrap-${Date.now()}-${requestSequence}`;
      const request = createDesktopBootstrapRequest(requestId);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
        request,
      );
      const projection = parseDesktopBootstrapProjection(response, requestId);
      currentDesktopEndpointEpoch = createDesktopEndpointEpoch(
        projection.application.instanceId,
        projection.window.windowId,
        projection.window.rendererEpoch,
      );
      return projection;
    },
  },
  lifecycle: {
    subscribe(listener: (event: DesktopLifecycleEvent) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        const event = parseDesktopLifecycleEvent(value);
        currentDesktopEndpointEpoch = createDesktopEndpointEpoch(
          event.applicationInstanceId,
          event.windowId,
          event.rendererEpoch,
        );
        listener(event);
      };
      ipcRenderer.on(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, handler);
      };
    },
  },
  settings: {
    async get() {
      const request = createDesktopApplicationSettingsRequest(
        nextRequestId('desktop-application-settings'),
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_APPLICATION_SETTINGS_CHANNELS.snapshotGet,
        request,
      );
      const projection = parseDesktopApplicationSettingsResponse(
        response,
        request.requestId,
      ).projection;
      currentSettingsProjection = projection;
      return projection;
    },
    async update(preferences, expectedRevision) {
      const request = createDesktopApplicationSettingsUpdateRequest(
        nextRequestId('desktop-application-settings-update'),
        expectedRevision,
        preferences,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_APPLICATION_SETTINGS_CHANNELS.update,
        request,
      );
      const projection = parseDesktopApplicationSettingsResponse(
        response,
        request.requestId,
      ).projection;
      currentSettingsProjection = projection;
      return projection;
    },
    async openAgentAdvanced() {
      const request = createDesktopApplicationSettingsRequest(
        nextRequestId('desktop-agent-advanced-settings'),
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_APPLICATION_SETTINGS_CHANNELS.agentAdvancedOpen,
        request,
      );
      parseDesktopAgentAdvancedSettingsResult(response, request.requestId);
    },
    subscribe(listener) {
      settingsListeners.add(listener);
      return () => {
        settingsListeners.delete(listener);
      };
    },
  },
  home: {
    assets: {
      async search(input) {
        const request = createDesktopHomeAssetSearchRequest(
          nextRequestId('desktop-home-assets'),
          requireDesktopEndpointEpoch(),
          input,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsSearch,
          request,
        );
        return parseDesktopHomeAssetSearchResult(response, request.requestId);
      },
      async importFiles(expectedRevision) {
        const request = createDesktopHomeAssetImportRequest(
          nextRequestId('desktop-home-assets-import'),
          requireDesktopEndpointEpoch(),
          expectedRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsImport,
          request,
        );
        return parseDesktopHomeAssetImportResult(response, request.requestId);
      },
      async remove(assetId, expectedRevision) {
        const request = createDesktopHomeAssetRemoveRequest(
          nextRequestId('desktop-home-assets-remove'),
          requireDesktopEndpointEpoch(),
          assetId,
          expectedRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemove,
          request,
        );
        return parseDesktopHomeAssetRemoveResult(response, request.requestId);
      },
    },
    libraryThumbnails: {
      async resolve(input) {
        const request = createDesktopHomeLibraryThumbnailRequest(
          nextRequestId('desktop-home-library-thumbnail'),
          requireDesktopEndpointEpoch(),
          input,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.libraryThumbnailResolve,
          request,
        );
        return parseDesktopHomeLibraryThumbnailResult(response, request.requestId);
      },
    },
    mediaLibraries: {
      async search(input) {
        const request = createDesktopHomeMediaLibrarySearchRequest(
          nextRequestId('desktop-home-media-libraries'),
          requireDesktopEndpointEpoch(),
          input,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesSearch,
          request,
        );
        return parseDesktopHomeMediaLibrarySearchResult(response, request.requestId);
      },
      async children(input) {
        const request = createDesktopHomeMediaLibraryChildrenRequest(
          nextRequestId('desktop-home-media-library-children'),
          requireDesktopEndpointEpoch(),
          input,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesChildren,
          request,
        );
        return parseDesktopHomeMediaLibraryChildrenResult(response, request.requestId);
      },
      async addLibrary(locationKind, expectedRevision) {
        const request = createDesktopHomeMediaLibraryAddRequest(
          nextRequestId('desktop-home-media-library-add'),
          requireDesktopEndpointEpoch(),
          locationKind,
          expectedRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesAdd,
          request,
        );
        return parseDesktopHomeMediaLibraryAddResult(response, request.requestId);
      },
      async relinkLibrary(libraryId, expectedRevision) {
        const request = createDesktopHomeMediaLibraryRequest(
          nextRequestId('desktop-home-media-library-relink'),
          requireDesktopEndpointEpoch(),
          libraryId,
          expectedRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRelink,
          request,
        );
        return parseDesktopHomeMediaLibraryRelinkResult(response, request.requestId);
      },
      async removeLibrary(libraryId, expectedRevision) {
        const request = createDesktopHomeMediaLibraryRequest(
          nextRequestId('desktop-home-media-library-remove'),
          requireDesktopEndpointEpoch(),
          libraryId,
          expectedRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRemove,
          request,
        );
        return parseDesktopHomeMediaLibraryRemoveResult(response, request.requestId);
      },
      async revealLibrary(libraryId, expectedRevision) {
        const request = createDesktopHomeMediaLibraryRequest(
          nextRequestId('desktop-home-media-library-reveal'),
          requireDesktopEndpointEpoch(),
          libraryId,
          expectedRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesReveal,
          request,
        );
        return parseDesktopHomeMediaLibraryRevealResult(response, request.requestId);
      },
    },
    extensions: {
      async list() {
        const request = createDesktopHomeExtensionsRequest(
          nextRequestId('desktop-home-extensions'),
          requireDesktopEndpointEpoch(),
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionsList,
          request,
        );
        return parseDesktopHomeExtensionsResult(response, request.requestId);
      },
      async installPlugin(pluginId, expectedCatalogRevision) {
        const request = createDesktopHomePluginMutationRequest(
          nextRequestId('desktop-home-plugin-install'),
          requireDesktopEndpointEpoch(),
          pluginId,
          expectedCatalogRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPluginInstall,
          request,
        );
        return parseDesktopHomeExtensionMutationResult(response, request.requestId);
      },
      async removePlugin(pluginId, expectedCatalogRevision) {
        const request = createDesktopHomePluginMutationRequest(
          nextRequestId('desktop-home-plugin-remove'),
          requireDesktopEndpointEpoch(),
          pluginId,
          expectedCatalogRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPluginRemove,
          request,
        );
        return parseDesktopHomeExtensionMutationResult(response, request.requestId);
      },
      async refreshMarketplaces(expectedCatalogRevision) {
        const request = createDesktopHomeCatalogMutationRequest(
          nextRequestId('desktop-home-marketplaces-refresh'),
          requireDesktopEndpointEpoch(),
          expectedCatalogRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionMarketplacesRefresh,
          request,
        );
        return parseDesktopHomeExtensionMutationResult(response, request.requestId);
      },
      async installPersonalSkill(expectedCatalogRevision) {
        const request = createDesktopHomeCatalogMutationRequest(
          nextRequestId('desktop-home-personal-skill-install'),
          requireDesktopEndpointEpoch(),
          expectedCatalogRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPersonalSkillInstall,
          request,
        );
        return parseDesktopHomeExtensionMutationResult(response, request.requestId);
      },
      async removePersonalSkill(managementId, expectedCatalogRevision) {
        const request = createDesktopHomePersonalSkillRemoveRequest(
          nextRequestId('desktop-home-personal-skill-remove'),
          requireDesktopEndpointEpoch(),
          managementId,
          expectedCatalogRevision,
        );
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPersonalSkillRemove,
          request,
        );
        return parseDesktopHomeExtensionMutationResult(response, request.requestId);
      },
    },
  },
  resources: {
    async getSnapshot(value) {
      const request = parseResourceBrowserSnapshotRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
        request,
      );
      const projection = parseResourceBrowserProjection(response);
      if (!isSameResourceBrowserIdentity(projection.identity, request.identity)) {
        throw new Error('Desktop Resource Browser snapshot owner identity does not match.');
      }
      currentResourceIdentity = projection.identity;
      currentResourceEventSequence = 0;
      return projection;
    },
    async search(value) {
      const request = parseResourceBrowserSearchRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.search,
        request,
      );
      return parseResourceBrowserProjection(response);
    },
    async children(value) {
      const request = parseResourceBrowserChildrenRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.children,
        request,
      );
      return parseResourceBrowserProjection(response);
    },
    async resolveThumbnail(value) {
      const request = parseResourceBrowserThumbnailRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.thumbnailResolve,
        request,
      );
      const result = parseResourceBrowserThumbnailResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.resourceId !== request.resourceId ||
        result.descriptorId !== request.descriptorId ||
        result.revision !== request.revision
      ) {
        throw new Error('Desktop Resource Browser thumbnail result identity does not match.');
      }
      return result;
    },
    async resolveQuickPreview(value) {
      const request = parseResourceBrowserQuickPreviewRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewResolve,
        request,
      );
      const result = parseResourceBrowserQuickPreviewResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.resourceId !== request.resourceId
      ) {
        throw new Error('Desktop Resource Browser quick preview result identity does not match.');
      }
      return result;
    },
    async releaseQuickPreview(value) {
      const request = parseResourceBrowserQuickPreviewReleaseRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewRelease,
        request,
      );
      const result = parseResourceBrowserQuickPreviewReleaseResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.previewSessionId !== request.previewSessionId
      ) {
        throw new Error(
          'Desktop Resource Browser quick preview release result identity does not match.',
        );
      }
      return result;
    },
    async planRecovery(value) {
      const request = parseResourceBrowserRecoveryPlanRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryPlan,
        request,
      );
      const result = parseResourceBrowserRecoveryPlanResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.resourceId !== request.resourceId ||
        (result.status === 'planned' &&
          (result.plan.workspaceId !== request.identity.workspaceId ||
            result.plan.operationRevision !== request.expectedOperationRevision))
      ) {
        throw new Error('Desktop Resource Browser recovery plan identity does not match.');
      }
      return result;
    },
    async applyRecovery(value) {
      const request = parseResourceBrowserRecoveryApplyRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryApply,
        request,
      );
      const projection = parseResourceBrowserProjection(response);
      if (!isSameResourceBrowserIdentity(projection.identity, request.identity)) {
        throw new Error('Desktop Resource Browser recovery projection identity does not match.');
      }
      return projection;
    },
    async cancelRecovery(value) {
      const request = parseResourceBrowserRecoveryCancelRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryCancel,
        request,
      );
      const result = parseResourceBrowserRecoveryCancelResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.planId !== request.planId
      ) {
        throw new Error('Desktop Resource Browser recovery cancellation identity does not match.');
      }
      return result;
    },
    async execute(value) {
      const request = parseResourceBrowserIntentRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
        request,
      );
      return parseResourceBrowserProjection(response);
    },
    subscribe(listener) {
      resourceListeners.add(listener);
      return () => {
        resourceListeners.delete(listener);
      };
    },
  },
  projectPortability: {
    async inspect(value) {
      const request = parseDesktopProjectPortabilityRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.inspect,
        request,
      );
      const result = parseDesktopProjectPortabilityInspectResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      currentProjectPortabilityIdentity = request.identity;
      return result;
    },
    async plan(value) {
      const request = parseDesktopProjectPortabilityRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.plan,
        request,
      );
      const result = parseDesktopProjectPortabilityPlanResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (result.status === 'planned' && result.plan.workspaceId !== request.identity.workspaceId) {
        throw new Error('Desktop project portability plan Workspace identity does not match.');
      }
      currentProjectPortabilityIdentity = request.identity;
      return result;
    },
    async resume(value) {
      const request = parseDesktopProjectPortabilityResumeRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.resume,
        request,
      );
      const result = parseDesktopProjectPortabilityPlanResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (
        result.status === 'planned' &&
        (result.plan.workspaceId !== request.identity.workspaceId ||
          result.plan.snapshotId !== request.snapshotId)
      ) {
        throw new Error('Desktop project portability resume identity does not match.');
      }
      currentProjectPortabilityIdentity = request.identity;
      return result;
    },
    async execute(value) {
      const request = parseDesktopProjectPortabilityExecuteRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.execute,
        request,
      );
      const result = parseDesktopProjectPortabilityExecuteResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (result.snapshotId !== request.snapshotId) {
        throw new Error('Desktop project portability execution identity does not match.');
      }
      return result;
    },
    async cancel(value) {
      const request = parseDesktopProjectPortabilityResumeRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.cancel,
        request,
      );
      const result = parseDesktopProjectPortabilityCancelResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (result.snapshotId !== request.snapshotId) {
        throw new Error('Desktop project portability cancellation identity does not match.');
      }
      return result;
    },
    subscribe(listener) {
      projectPortabilityListeners.add(listener);
      return () => {
        projectPortabilityListeners.delete(listener);
      };
    },
  },
  preview: {
    async getSnapshot(value) {
      const request = parseDesktopPreviewBootstrapRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PREVIEW_CHANNELS.snapshotGet,
        request,
      );
      const projection = parseDesktopPreviewProjection(response);
      if (
        projection.identity.projectId !== request.projectId ||
        projection.identity.workspaceId !== request.workspaceId ||
        projection.identity.viewId !== request.viewId ||
        projection.identity.viewEpoch !== request.viewEpoch ||
        projection.identity.sessionId !== request.sessionId ||
        projection.identity.endpointEpoch !== request.endpointEpoch
      ) {
        throw new Error('Desktop Preview projection owner identity does not match.');
      }
      currentPreviewIdentities.set(previewIdentityKey(projection.identity), projection.identity);
      return projection;
    },
    async execute(value) {
      const request = parseDesktopPreviewRuntimeRequest(value);
      const key = previewIdentityKey(request.identity);
      const identity = currentPreviewIdentities.get(key);
      if (!identity || !isSamePreviewIdentity(request.identity, identity)) {
        throw new Error('Desktop Preview request requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PREVIEW_CHANNELS.requestExecute,
        request,
      );
      const projection = parseDesktopPreviewProjection(response);
      currentPreviewIdentities.delete(key);
      currentPreviewIdentities.set(previewIdentityKey(projection.identity), projection.identity);
      return projection;
    },
  },
  canvas: {
    async getSnapshot(value) {
      const identity = parseDesktopCanvasHostIdentity(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.snapshotGet,
        identity,
      );
      const snapshot = parseCanvasHostSnapshot(response);
      if (!isSameCanvasHostIdentity(snapshot.identity, identity)) {
        throw new Error('Desktop Canvas snapshot owner identity does not match.');
      }
      const key = canvasIdentityKey(snapshot.identity);
      currentCanvasIdentities.set(key, snapshot.identity);
      currentCanvasEventSequences.set(
        key,
        preserveDesktopBootstrapEventSequence(currentCanvasEventSequences.get(key)),
      );
      return snapshot;
    },
    async resolveMaterialActions(value) {
      const request = parseCanvasMaterialActionResolutionRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error(
          'Desktop Canvas material action resolution requires a current owner-bound snapshot.',
        );
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.materialActionsResolve,
        request,
      );
      return parseCanvasMaterialActionResolution(response, request.requestId);
    },
    async executeIntent(value) {
      const request = parseCanvasHostIntentRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas intent requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.intentExecute,
        request,
      );
      return parseCanvasHostIntentResult(response, request.requestId, request.commandId);
    },
    async resolvePreviewVariant(value) {
      const request = parseDesktopCanvasPreviewVariantRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas preview requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.previewVariantResolve,
        request,
      );
      return parseDesktopCanvasPreviewVariantResult(response, request.requestId);
    },
    async executeMediaRequest(value) {
      const request = parseDesktopCanvasMediaRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas media request requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.mediaRequestExecute,
        request,
      );
      return parseDesktopCanvasMediaResponse(response, request.nodeId);
    },
    subscribe(identity, listener) {
      const entry = { identity: parseDesktopCanvasHostIdentity(identity), listener };
      canvasListeners.add(entry);
      return () => canvasListeners.delete(entry);
    },
  },
  cut: {
    async getSnapshot(value) {
      const identity = parseDesktopCutHostIdentity(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CUT_CHANNELS.snapshotGet,
        identity,
      );
      const snapshot = parseCutHostRuntimeSnapshot(response);
      if (!isSameCutHostIdentity(snapshot.identity, identity)) {
        throw new Error('Desktop Cut snapshot owner identity does not match.');
      }
      const key = cutIdentityKey(snapshot.identity);
      currentCutIdentities.set(key, snapshot.identity);
      currentCutEventSequences.set(
        key,
        preserveDesktopBootstrapEventSequence(currentCutEventSequences.get(key)),
      );
      return snapshot;
    },
    async execute(value) {
      const request = parseCutHostRuntimeRequest(value);
      const identity = currentCutIdentities.get(cutIdentityKey(request.identity));
      if (!identity || !isSameCutHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Cut request requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CUT_CHANNELS.requestExecute,
        request,
      );
      const result = parseCutHostRuntimeResult(response);
      if (!isSameCutHostIdentity(result.snapshot.identity, identity)) {
        throw new Error('Desktop Cut response owner identity does not match.');
      }
      return result;
    },
    subscribe(identity, listener) {
      const entry = { identity: parseDesktopCutHostIdentity(identity), listener };
      cutListeners.add(entry);
      return () => cutListeners.delete(entry);
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
    async open(projectId) {
      const context = requireShellMutationContext();
      const request = createDesktopProjectOpenRequest(
        nextRequestId('desktop-project-catalog-open'),
        projectId,
        context.endpointEpoch,
        context.windowRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
        request,
      );
      const result = parseDesktopOpenContentResult(response, request.requestId);
      rememberShellProjection(result.projection);
      return result;
    },
    async removeRecent(projectId, expectedWindowRevision, expectedCatalogRevision) {
      const context = requireShellMutationContext();
      const request = createDesktopProjectRemoveRecentRequest(
        nextRequestId('desktop-project-remove-recent'),
        projectId,
        context.endpointEpoch,
        expectedWindowRevision,
        expectedCatalogRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectRemoveRecent,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
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
  conversations: {
    async delete(navigation, expectedWindowRevision, expectedAgentHomeRevision) {
      const context = requireShellMutationContext();
      const request = createDesktopConversationDeleteRequest(
        nextRequestId('desktop-conversation-delete'),
        navigation,
        context.endpointEpoch,
        expectedWindowRevision,
        expectedAgentHomeRevision,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.conversationDelete,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
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
      const response: unknown = await ipcRenderer.invoke(DESKTOP_SHELL_CHANNELS.tabClose, request);
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
  workbench: {
    async update(workbench, expectedWindowRevision, expectedWorkbenchRevision) {
      const context = requireShellMutationContext();
      const request = createDesktopWorkbenchMutationRequest(
        nextRequestId('desktop-workbench-update'),
        context.endpointEpoch,
        expectedWindowRevision,
        expectedWorkbenchRevision,
        workbench,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.workbenchUpdate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
};

ipcRenderer.on(
  DESKTOP_APPLICATION_SETTINGS_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseDesktopApplicationSettingsProjectionEvent(value);
    const current = currentSettingsProjection;
    if (current && event.sequence !== current.eventSequence + 1) {
      throw new DesktopApplicationSettingsContractError(
        'desktop-application-settings-event-sequence',
        `Desktop settings event sequence ${event.sequence} does not follow ${current.eventSequence}.`,
      );
    }
    currentSettingsProjection = event.projection;
    for (const listener of settingsListeners) listener(event);
  },
);

ipcRenderer.on(
  DESKTOP_AGENT_CHANNELS.messageEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseDesktopAgentMessageEvent(value);
    const current = currentAgentEventCursor;
    if (!current || !isSameDesktopAgentEventConnection(event.connection, current.connection)) {
      emitAgentMessage({
        type: 'globalError',
        message: 'Desktop Agent rejected an event for a stale or foreign connection.',
      });
      return;
    }
    if (event.sequence !== current.sequence + 1) {
      emitAgentMessage({
        type: 'globalError',
        message: `Desktop Agent event sequence ${event.sequence} does not follow ${current.sequence}.`,
      });
      return;
    }
    currentAgentEventCursor = {
      connection: current.connection,
      sequence: event.sequence,
    };
    emitAgentMessage(event.message);
  },
);

ipcRenderer.on(
  DESKTOP_CUT_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseCutHostRuntimeProjectionEvent(value);
    const key = cutIdentityKey(event.snapshot.identity);
    const identity = currentCutIdentities.get(key);
    if (!identity || !isSameCutHostIdentity(event.snapshot.identity, identity)) {
      return;
    }
    const sequence = currentCutEventSequences.get(key) ?? 0;
    if (event.sequence !== sequence + 1) {
      return;
    }
    currentCutEventSequences.set(key, event.sequence);
    for (const entry of cutListeners) {
      if (isSameCutHostIdentity(entry.identity, identity)) entry.listener(event);
    }
  },
);

ipcRenderer.on(
  DESKTOP_RESOURCE_BROWSER_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseResourceBrowserProjectionEvent(value);
    const identity = currentResourceIdentity;
    if (!identity || !isSameResourceBrowserIdentity(event.projection.identity, identity)) {
      return;
    }
    if (event.sequence !== currentResourceEventSequence + 1) {
      return;
    }
    currentResourceEventSequence = event.sequence;
    for (const listener of resourceListeners) listener(event);
  },
);

ipcRenderer.on(
  DESKTOP_PROJECT_PORTABILITY_CHANNELS.progressEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseDesktopProjectPortabilityProgressEvent(value);
    const identity = currentProjectPortabilityIdentity;
    if (!identity || !isSameDesktopProjectPortabilityIdentity(event.identity, identity)) {
      return;
    }
    const currentSequence = projectPortabilityEventSequences.get(event.progress.snapshotId) ?? 0;
    if (event.sequence !== currentSequence + 1) return;
    projectPortabilityEventSequences.set(event.progress.snapshotId, event.sequence);
    for (const listener of projectPortabilityListeners) listener(event);
  },
);

ipcRenderer.on(
  DESKTOP_CANVAS_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event: CanvasHostProjectionEvent = parseCanvasHostProjectionEvent(value);
    const key = canvasIdentityKey(event.snapshot.identity);
    const identity = currentCanvasIdentities.get(key);
    if (!identity || !isSameCanvasHostIdentity(event.snapshot.identity, identity)) {
      return;
    }
    const sequence = currentCanvasEventSequences.get(key) ?? 0;
    if (event.sequence !== sequence + 1) {
      return;
    }
    currentCanvasEventSequences.set(key, event.sequence);
    for (const entry of canvasListeners) {
      if (isSameCanvasHostIdentity(entry.identity, identity)) entry.listener(event);
    }
  },
);

contextBridge.exposeInMainWorld('openNekoDesktop', bridge);

function nextRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}-${Date.now()}-${requestSequence}`;
}

function createDesktopEndpointEpoch(
  applicationInstanceId: string,
  windowId: string,
  rendererEpoch: number,
): string {
  return `${applicationInstanceId}:${windowId}:${rendererEpoch}`;
}

function requireDesktopEndpointEpoch(): string {
  if (!currentDesktopEndpointEpoch) {
    throw new Error('Desktop Home request requires a sender-bound bootstrap identity.');
  }
  return currentDesktopEndpointEpoch;
}

function rememberShellProjection<
  T extends {
    readonly endpointEpoch: string;
    readonly projectionRevision: number;
    readonly window: { readonly revision: number };
  },
>(projection: T): T {
  latestShellProjection = advanceDesktopShellProjectionCursor(latestShellProjection, projection);
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

function emitAgentMessage(
  message: Parameters<Parameters<OpenNekoDesktopAgentBridge['agent']['subscribe']>[0]>[0],
): void {
  for (const listener of agentListeners) listener(message);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireCurrentResourceIdentity(identity: ResourceBrowserIdentity): void {
  const current = currentResourceIdentity;
  if (!current || !isSameResourceBrowserIdentity(identity, current)) {
    throw new Error('Desktop Resource Browser request requires a current owner-bound snapshot.');
  }
}

function requireProjectPortabilityResultIdentity(
  expectedIdentity: DesktopProjectPortabilityIdentity,
  actualIdentity: DesktopProjectPortabilityIdentity,
  expectedRequestId: string,
  actualRequestId: string,
): void {
  if (
    expectedRequestId !== actualRequestId ||
    !isSameDesktopProjectPortabilityIdentity(expectedIdentity, actualIdentity)
  ) {
    throw new Error('Desktop project portability result identity does not match.');
  }
}

function canvasIdentityKey(identity: CanvasHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}

function cutIdentityKey(identity: CutHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}

function previewIdentityKey(identity: PreviewRuntimeIdentity): string {
  return [identity.windowId, identity.sessionId, identity.endpointEpoch].join(':');
}

function isSamePreviewIdentity(
  left: PreviewRuntimeIdentity,
  right: PreviewRuntimeIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewEpoch === right.viewEpoch &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.endpointEpoch === right.endpointEpoch &&
    left.revision === right.revision
  );
}
