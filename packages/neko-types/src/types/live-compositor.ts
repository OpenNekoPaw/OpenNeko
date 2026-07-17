// =============================================================================
// Live Compositor - L0 shared contracts
//
// Pure DTOs and guards only. Rendering, device, DOM, React, and VSCode details
// belong in engine, extension, or Webview layers.
// =============================================================================

import {
  createViewportPayloadGuardRegistry,
  isViewportSerializableValue,
  type ViewportPayloadGuard,
  type ViewportPayloadGuardRegistry,
  type ViewportSerializableRecord,
} from './viewport-protocol';

export const LIVE_COMPOSITOR_CONTRACT_VERSION = 1 as const;

export type LiveCompositorContractVersion = typeof LIVE_COMPOSITOR_CONTRACT_VERSION;
export type LiveCompositorRevision = number;
export type LiveCompositorVec2 = [number, number];
export type LiveCompositorRect = [number, number, number, number];
export type LiveCompositorAffine2D = [number, number, number, number, number, number];

export type LiveCompositorSourceKind =
  | 'solid'
  | 'media'
  | 'camera'
  | 'puppet'
  | 'model'
  | 'scene'
  | 'overlay'
  | 'tracking-overlay';

export type LiveCompositorLayerRole =
  | 'background'
  | 'camera'
  | 'avatar'
  | 'prop'
  | 'overlay'
  | 'diagnostic';

export type LiveCompositorBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'add'
  | 'subtract'
  | 'alpha';

export type LiveCompositorSourceUnavailablePolicy =
  | 'exclude'
  | 'substitute'
  | 'hold-last-frame'
  | 'diagnostic-overlay';

export type LiveTrackingOverlayMode = 'off' | 'landmarks' | 'skeleton' | 'bounds' | 'vectors';
export type LiveTrackingOverlayStalePolicy = 'hide' | 'dim' | 'hold-last-frame';

export type LiveOutputRouteKind = 'monitor' | 'recording' | 'obs-virtual-camera' | 'rtmp';
export type LiveOutputRouteStatus =
  | 'disabled'
  | 'available'
  | 'active'
  | 'unavailable'
  | 'unsupported'
  | 'permission-required';

export type LiveCompositorDiagnosticSeverity = 'info' | 'warning' | 'error';
export type LiveCompositorDiagnosticCode =
  | 'unsupported-source'
  | 'unsupported-output-route'
  | 'unavailable-output-route'
  | 'permission-required'
  | 'stale-revision'
  | 'latency-budget-exceeded'
  | 'latency-unavailable'
  | 'preview-non-authoritative';

export type LiveCompositorLatencyKind =
  | 'command-to-frame'
  | 'tracking-to-frame'
  | 'encode'
  | 'decode'
  | 'presentation'
  | 'end-to-end';

export interface LiveCompositorCanvas {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly pixelRatio?: number;
  readonly colorSpace?: 'srgb' | 'display-p3';
  readonly background?: string;
}

export interface LiveCompositorTransform {
  readonly position: LiveCompositorVec2;
  readonly scale: LiveCompositorVec2;
  readonly rotationDeg: number;
  readonly anchor: LiveCompositorVec2;
  readonly size?: LiveCompositorVec2;
  readonly crop?: LiveCompositorRect;
  readonly matrix?: LiveCompositorAffine2D;
}

export interface LiveCompositorSourceRef {
  readonly sourceId: string;
  readonly kind: LiveCompositorSourceKind;
  readonly label?: string;
  readonly mediaRef?: string;
  readonly deviceSessionRef?: string;
  readonly streamRef?: string;
  readonly entityRef?: string;
  readonly sceneRef?: string;
  readonly color?: string;
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveCompositorLayer {
  readonly id: string;
  readonly role: LiveCompositorLayerRole;
  readonly label?: string;
  readonly source: LiveCompositorSourceRef;
  readonly transform: LiveCompositorTransform;
  readonly opacity: number;
  readonly blendMode: LiveCompositorBlendMode;
  readonly visible: boolean;
  readonly zIndex: number;
  readonly locked?: boolean;
  readonly sourceUnavailablePolicy: LiveCompositorSourceUnavailablePolicy;
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveCompositorLayerPatch {
  readonly role?: LiveCompositorLayerRole;
  readonly label?: string;
  readonly source?: LiveCompositorSourceRef;
  readonly transform?: LiveCompositorTransform;
  readonly opacity?: number;
  readonly blendMode?: LiveCompositorBlendMode;
  readonly visible?: boolean;
  readonly zIndex?: number;
  readonly locked?: boolean;
  readonly sourceUnavailablePolicy?: LiveCompositorSourceUnavailablePolicy;
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveTrackingOverlayConfig {
  readonly id: string;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly mode: LiveTrackingOverlayMode;
  readonly sourceIds: string[];
  readonly opacity: number;
  readonly zIndex: number;
  readonly stalePolicy: LiveTrackingOverlayStalePolicy;
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveCompositorPreset {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly layerIds: string[];
  readonly outputRouteIds: string[];
  readonly trackingOverlay?: LiveTrackingOverlayConfig;
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveOutputRoute {
  readonly id: string;
  readonly kind: LiveOutputRouteKind;
  readonly label?: string;
  readonly enabled: boolean;
  readonly status: LiveOutputRouteStatus;
  readonly targetRef?: string;
  readonly diagnostics?: LiveCompositorDiagnostic[];
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveCompositorDiagnostic {
  readonly id: string;
  readonly code: LiveCompositorDiagnosticCode;
  readonly severity: LiveCompositorDiagnosticSeverity;
  readonly message: string;
  readonly timestamp: number;
  readonly layerId?: string;
  readonly sourceId?: string;
  readonly sourceKind?: LiveCompositorSourceKind;
  readonly routeId?: string;
  readonly retryable?: boolean;
  readonly details?: ViewportSerializableRecord;
}

export interface LiveCompositorLatencySample {
  readonly id: string;
  readonly kind: LiveCompositorLatencyKind;
  readonly timestamp: number;
  readonly valueMs?: number;
  readonly budgetMs?: number;
  readonly withinBudget?: boolean;
  readonly frameId?: number;
  readonly seq?: number;
  readonly sourceId?: string;
  readonly unavailableReason?: string;
  readonly metadata?: ViewportSerializableRecord;
}

export interface LiveCompositorScene {
  readonly contractVersion: LiveCompositorContractVersion;
  readonly sceneId: string;
  readonly viewportId?: string;
  readonly name?: string;
  readonly revision: LiveCompositorRevision;
  readonly canvas: LiveCompositorCanvas;
  readonly sources: LiveCompositorSourceRef[];
  readonly layers: LiveCompositorLayer[];
  readonly presets: LiveCompositorPreset[];
  readonly activePresetId?: string;
  readonly trackingOverlay: LiveTrackingOverlayConfig;
  readonly outputRoutes: LiveOutputRoute[];
  readonly diagnostics: LiveCompositorDiagnostic[];
  readonly latencySamples: LiveCompositorLatencySample[];
  readonly metadata?: ViewportSerializableRecord;
  readonly updatedAt: number;
}

export interface LiveCompositorSetPresetPayload {
  readonly presetId: string;
}

export interface LiveCompositorUpdateLayerPayload {
  readonly layerId: string;
  readonly patch: LiveCompositorLayerPatch;
}

export interface LiveCompositorReorderLayerPayload {
  readonly layerId?: string;
  readonly beforeLayerId?: string;
  readonly afterLayerId?: string;
  readonly zIndex?: number;
  readonly orderedLayerIds?: string[];
}

export interface LiveCompositorSetTrackingOverlayPayload {
  readonly trackingOverlay: LiveTrackingOverlayConfig;
}

export interface LiveCompositorSetOutputRoutePayload {
  readonly routeId: string;
  readonly enabled?: boolean;
  readonly route?: LiveOutputRoute;
}

export type LiveCompositorCommandAction =
  | 'scene:live:set-preset'
  | 'scene:live:update-layer'
  | 'scene:live:reorder-layer'
  | 'scene:live:set-tracking-overlay'
  | 'scene:live:set-output-route';

export type LiveCompositorCommandPayload =
  | LiveCompositorSetPresetPayload
  | LiveCompositorUpdateLayerPayload
  | LiveCompositorReorderLayerPayload
  | LiveCompositorSetTrackingOverlayPayload
  | LiveCompositorSetOutputRoutePayload;

export const LIVE_COMPOSITOR_COMMAND_ACTIONS = {
  setPreset: 'scene:live:set-preset',
  updateLayer: 'scene:live:update-layer',
  reorderLayer: 'scene:live:reorder-layer',
  setTrackingOverlay: 'scene:live:set-tracking-overlay',
  setOutputRoute: 'scene:live:set-output-route',
} as const;

export function isLiveCompositorContractVersion(
  value: unknown,
): value is LiveCompositorContractVersion {
  return value === LIVE_COMPOSITOR_CONTRACT_VERSION;
}

export function isLiveCompositorScene(value: unknown): value is LiveCompositorScene {
  if (!isRecord(value)) return false;
  return (
    isLiveCompositorContractVersion(value['contractVersion']) &&
    typeof value['sceneId'] === 'string' &&
    (value['viewportId'] === undefined || typeof value['viewportId'] === 'string') &&
    (value['name'] === undefined || typeof value['name'] === 'string') &&
    isNonNegativeInteger(value['revision']) &&
    isLiveCompositorCanvas(value['canvas']) &&
    isArrayOf(value['sources'], isLiveCompositorSourceRef) &&
    isArrayOf(value['layers'], isLiveCompositorLayer) &&
    isArrayOf(value['presets'], isLiveCompositorPreset) &&
    (value['activePresetId'] === undefined || typeof value['activePresetId'] === 'string') &&
    isLiveTrackingOverlayConfig(value['trackingOverlay']) &&
    isArrayOf(value['outputRoutes'], isLiveOutputRoute) &&
    isArrayOf(value['diagnostics'], isLiveCompositorDiagnostic) &&
    isArrayOf(value['latencySamples'], isLiveCompositorLatencySample) &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata'])) &&
    isFiniteNumber(value['updatedAt'])
  );
}

export function isLiveCompositorLayer(value: unknown): value is LiveCompositorLayer {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isLiveCompositorLayerRole(value['role']) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    isLiveCompositorSourceRef(value['source']) &&
    isLiveCompositorTransform(value['transform']) &&
    isOpacity(value['opacity']) &&
    isLiveCompositorBlendMode(value['blendMode']) &&
    typeof value['visible'] === 'boolean' &&
    isFiniteNumber(value['zIndex']) &&
    (value['locked'] === undefined || typeof value['locked'] === 'boolean') &&
    isLiveCompositorSourceUnavailablePolicy(value['sourceUnavailablePolicy']) &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

export function isLiveCompositorSourceRef(value: unknown): value is LiveCompositorSourceRef {
  if (!isRecord(value)) return false;
  return (
    typeof value['sourceId'] === 'string' &&
    isLiveCompositorSourceKind(value['kind']) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['mediaRef'] === undefined || typeof value['mediaRef'] === 'string') &&
    (value['deviceSessionRef'] === undefined || typeof value['deviceSessionRef'] === 'string') &&
    (value['streamRef'] === undefined || typeof value['streamRef'] === 'string') &&
    (value['entityRef'] === undefined || typeof value['entityRef'] === 'string') &&
    (value['sceneRef'] === undefined || typeof value['sceneRef'] === 'string') &&
    (value['color'] === undefined || typeof value['color'] === 'string') &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

export function isLiveCompositorPreset(value: unknown): value is LiveCompositorPreset {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['label'] === 'string' &&
    isFiniteNumber(value['order']) &&
    isStringArray(value['layerIds']) &&
    isStringArray(value['outputRouteIds']) &&
    (value['trackingOverlay'] === undefined ||
      isLiveTrackingOverlayConfig(value['trackingOverlay'])) &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

export function isLiveTrackingOverlayConfig(value: unknown): value is LiveTrackingOverlayConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['enabled'] === 'boolean' &&
    typeof value['visible'] === 'boolean' &&
    isLiveTrackingOverlayMode(value['mode']) &&
    isStringArray(value['sourceIds']) &&
    isOpacity(value['opacity']) &&
    isFiniteNumber(value['zIndex']) &&
    isLiveTrackingOverlayStalePolicy(value['stalePolicy']) &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

export function isLiveOutputRoute(value: unknown): value is LiveOutputRoute {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isLiveOutputRouteKind(value['kind']) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    typeof value['enabled'] === 'boolean' &&
    isLiveOutputRouteStatus(value['status']) &&
    (value['targetRef'] === undefined || typeof value['targetRef'] === 'string') &&
    (value['diagnostics'] === undefined ||
      isArrayOf(value['diagnostics'], isLiveCompositorDiagnostic)) &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

export function isLiveCompositorDiagnostic(value: unknown): value is LiveCompositorDiagnostic {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isLiveCompositorDiagnosticCode(value['code']) &&
    isLiveCompositorDiagnosticSeverity(value['severity']) &&
    typeof value['message'] === 'string' &&
    isFiniteNumber(value['timestamp']) &&
    (value['layerId'] === undefined || typeof value['layerId'] === 'string') &&
    (value['sourceId'] === undefined || typeof value['sourceId'] === 'string') &&
    (value['sourceKind'] === undefined || isLiveCompositorSourceKind(value['sourceKind'])) &&
    (value['routeId'] === undefined || typeof value['routeId'] === 'string') &&
    (value['retryable'] === undefined || typeof value['retryable'] === 'boolean') &&
    (value['details'] === undefined || isSerializableRecord(value['details']))
  );
}

export function isLiveCompositorLatencySample(
  value: unknown,
): value is LiveCompositorLatencySample {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isLiveCompositorLatencyKind(value['kind']) &&
    isFiniteNumber(value['timestamp']) &&
    (value['valueMs'] === undefined || isNonNegativeFiniteNumber(value['valueMs'])) &&
    (value['budgetMs'] === undefined || isNonNegativeFiniteNumber(value['budgetMs'])) &&
    (value['withinBudget'] === undefined || typeof value['withinBudget'] === 'boolean') &&
    (value['frameId'] === undefined || isNonNegativeInteger(value['frameId'])) &&
    (value['seq'] === undefined || isNonNegativeInteger(value['seq'])) &&
    (value['sourceId'] === undefined || typeof value['sourceId'] === 'string') &&
    (value['unavailableReason'] === undefined || typeof value['unavailableReason'] === 'string') &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

export function isLiveCompositorSetPresetPayload(
  value: unknown,
): value is LiveCompositorSetPresetPayload {
  if (!isRecord(value)) return false;
  return typeof value['presetId'] === 'string' && isSerializableRecord(value);
}

export function isLiveCompositorUpdateLayerPayload(
  value: unknown,
): value is LiveCompositorUpdateLayerPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value['layerId'] === 'string' &&
    isLiveCompositorLayerPatch(value['patch']) &&
    isSerializableRecord(value)
  );
}

export function isLiveCompositorReorderLayerPayload(
  value: unknown,
): value is LiveCompositorReorderLayerPayload {
  if (!isRecord(value) || !isSerializableRecord(value)) return false;
  if (value['orderedLayerIds'] !== undefined) {
    return isStringArray(value['orderedLayerIds']);
  }
  return (
    typeof value['layerId'] === 'string' &&
    (value['beforeLayerId'] === undefined || typeof value['beforeLayerId'] === 'string') &&
    (value['afterLayerId'] === undefined || typeof value['afterLayerId'] === 'string') &&
    (value['zIndex'] === undefined || isFiniteNumber(value['zIndex'])) &&
    (value['beforeLayerId'] !== undefined ||
      value['afterLayerId'] !== undefined ||
      value['zIndex'] !== undefined)
  );
}

export function isLiveCompositorSetTrackingOverlayPayload(
  value: unknown,
): value is LiveCompositorSetTrackingOverlayPayload {
  if (!isRecord(value)) return false;
  return isLiveTrackingOverlayConfig(value['trackingOverlay']) && isSerializableRecord(value);
}

export function isLiveCompositorSetOutputRoutePayload(
  value: unknown,
): value is LiveCompositorSetOutputRoutePayload {
  if (!isRecord(value)) return false;
  return (
    typeof value['routeId'] === 'string' &&
    (value['enabled'] === undefined || typeof value['enabled'] === 'boolean') &&
    (value['route'] === undefined || isLiveOutputRoute(value['route'])) &&
    isSerializableRecord(value)
  );
}

export function isLiveCompositorCommandAction(
  value: unknown,
): value is LiveCompositorCommandAction {
  return (
    value === LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset ||
    value === LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer ||
    value === LIVE_COMPOSITOR_COMMAND_ACTIONS.reorderLayer ||
    value === LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay ||
    value === LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute
  );
}

export function isLiveCompositorCommandPayload(
  action: LiveCompositorCommandAction,
  value: unknown,
): value is LiveCompositorCommandPayload {
  switch (action) {
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset:
      return isLiveCompositorSetPresetPayload(value);
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer:
      return isLiveCompositorUpdateLayerPayload(value);
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.reorderLayer:
      return isLiveCompositorReorderLayerPayload(value);
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay:
      return isLiveCompositorSetTrackingOverlayPayload(value);
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute:
      return isLiveCompositorSetOutputRoutePayload(value);
  }
}

export function registerLiveCompositorPayloadGuards(
  registry: ViewportPayloadGuardRegistry,
): ViewportPayloadGuardRegistry {
  registry.register(
    'scene',
    LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset,
    isLiveCompositorSetPresetViewportPayload,
  );
  registry.register(
    'scene',
    LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer,
    isLiveCompositorUpdateLayerViewportPayload,
  );
  registry.register(
    'scene',
    LIVE_COMPOSITOR_COMMAND_ACTIONS.reorderLayer,
    isLiveCompositorReorderLayerViewportPayload,
  );
  registry.register(
    'scene',
    LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay,
    isLiveCompositorSetTrackingOverlayViewportPayload,
  );
  registry.register(
    'scene',
    LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute,
    isLiveCompositorSetOutputRouteViewportPayload,
  );
  return registry;
}

export function createLiveCompositorPayloadGuardRegistry(): ViewportPayloadGuardRegistry {
  return registerLiveCompositorPayloadGuards(createViewportPayloadGuardRegistry());
}

export function getLiveCompositorPayloadGuard(
  action: LiveCompositorCommandAction,
): ViewportPayloadGuard {
  switch (action) {
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset:
      return isLiveCompositorSetPresetViewportPayload;
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer:
      return isLiveCompositorUpdateLayerViewportPayload;
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.reorderLayer:
      return isLiveCompositorReorderLayerViewportPayload;
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay:
      return isLiveCompositorSetTrackingOverlayViewportPayload;
    case LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute:
      return isLiveCompositorSetOutputRouteViewportPayload;
  }
}

function isLiveCompositorSetPresetViewportPayload(
  value: unknown,
): value is ViewportSerializableRecord {
  return isLiveCompositorSetPresetPayload(value) && isSerializableRecord(value);
}

function isLiveCompositorUpdateLayerViewportPayload(
  value: unknown,
): value is ViewportSerializableRecord {
  return isLiveCompositorUpdateLayerPayload(value) && isSerializableRecord(value);
}

function isLiveCompositorReorderLayerViewportPayload(
  value: unknown,
): value is ViewportSerializableRecord {
  return isLiveCompositorReorderLayerPayload(value) && isSerializableRecord(value);
}

function isLiveCompositorSetTrackingOverlayViewportPayload(
  value: unknown,
): value is ViewportSerializableRecord {
  return isLiveCompositorSetTrackingOverlayPayload(value) && isSerializableRecord(value);
}

function isLiveCompositorSetOutputRouteViewportPayload(
  value: unknown,
): value is ViewportSerializableRecord {
  return isLiveCompositorSetOutputRoutePayload(value) && isSerializableRecord(value);
}

function isLiveCompositorCanvas(value: unknown): value is LiveCompositorCanvas {
  if (!isRecord(value)) return false;
  return (
    isPositiveFiniteNumber(value['width']) &&
    isPositiveFiniteNumber(value['height']) &&
    isPositiveFiniteNumber(value['fps']) &&
    (value['pixelRatio'] === undefined || isPositiveFiniteNumber(value['pixelRatio'])) &&
    (value['colorSpace'] === undefined ||
      value['colorSpace'] === 'srgb' ||
      value['colorSpace'] === 'display-p3') &&
    (value['background'] === undefined || typeof value['background'] === 'string') &&
    isSerializableRecord(value)
  );
}

function isLiveCompositorTransform(value: unknown): value is LiveCompositorTransform {
  if (!isRecord(value)) return false;
  return (
    isVec2(value['position']) &&
    isVec2(value['scale']) &&
    isFiniteNumber(value['rotationDeg']) &&
    isVec2(value['anchor']) &&
    (value['size'] === undefined || isVec2(value['size'])) &&
    (value['crop'] === undefined || isRect(value['crop'])) &&
    (value['matrix'] === undefined || isAffine2D(value['matrix'])) &&
    isSerializableRecord(value)
  );
}

function isLiveCompositorLayerPatch(value: unknown): value is LiveCompositorLayerPatch {
  if (!isRecord(value) || !isSerializableRecord(value)) return false;
  const hasPatchField =
    value['role'] !== undefined ||
    value['label'] !== undefined ||
    value['source'] !== undefined ||
    value['transform'] !== undefined ||
    value['opacity'] !== undefined ||
    value['blendMode'] !== undefined ||
    value['visible'] !== undefined ||
    value['zIndex'] !== undefined ||
    value['locked'] !== undefined ||
    value['sourceUnavailablePolicy'] !== undefined ||
    value['metadata'] !== undefined;

  return (
    hasPatchField &&
    (value['role'] === undefined || isLiveCompositorLayerRole(value['role'])) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['source'] === undefined || isLiveCompositorSourceRef(value['source'])) &&
    (value['transform'] === undefined || isLiveCompositorTransform(value['transform'])) &&
    (value['opacity'] === undefined || isOpacity(value['opacity'])) &&
    (value['blendMode'] === undefined || isLiveCompositorBlendMode(value['blendMode'])) &&
    (value['visible'] === undefined || typeof value['visible'] === 'boolean') &&
    (value['zIndex'] === undefined || isFiniteNumber(value['zIndex'])) &&
    (value['locked'] === undefined || typeof value['locked'] === 'boolean') &&
    (value['sourceUnavailablePolicy'] === undefined ||
      isLiveCompositorSourceUnavailablePolicy(value['sourceUnavailablePolicy'])) &&
    (value['metadata'] === undefined || isSerializableRecord(value['metadata']))
  );
}

function isLiveCompositorSourceKind(value: unknown): value is LiveCompositorSourceKind {
  return (
    value === 'solid' ||
    value === 'media' ||
    value === 'camera' ||
    value === 'puppet' ||
    value === 'model' ||
    value === 'scene' ||
    value === 'overlay' ||
    value === 'tracking-overlay'
  );
}

function isLiveCompositorLayerRole(value: unknown): value is LiveCompositorLayerRole {
  return (
    value === 'background' ||
    value === 'camera' ||
    value === 'avatar' ||
    value === 'prop' ||
    value === 'overlay' ||
    value === 'diagnostic'
  );
}

function isLiveCompositorBlendMode(value: unknown): value is LiveCompositorBlendMode {
  return (
    value === 'normal' ||
    value === 'multiply' ||
    value === 'screen' ||
    value === 'overlay' ||
    value === 'add' ||
    value === 'subtract' ||
    value === 'alpha'
  );
}

function isLiveCompositorSourceUnavailablePolicy(
  value: unknown,
): value is LiveCompositorSourceUnavailablePolicy {
  return (
    value === 'exclude' ||
    value === 'substitute' ||
    value === 'hold-last-frame' ||
    value === 'diagnostic-overlay'
  );
}

function isLiveTrackingOverlayMode(value: unknown): value is LiveTrackingOverlayMode {
  return (
    value === 'off' ||
    value === 'landmarks' ||
    value === 'skeleton' ||
    value === 'bounds' ||
    value === 'vectors'
  );
}

function isLiveTrackingOverlayStalePolicy(value: unknown): value is LiveTrackingOverlayStalePolicy {
  return value === 'hide' || value === 'dim' || value === 'hold-last-frame';
}

function isLiveOutputRouteKind(value: unknown): value is LiveOutputRouteKind {
  return (
    value === 'monitor' ||
    value === 'recording' ||
    value === 'obs-virtual-camera' ||
    value === 'rtmp'
  );
}

function isLiveOutputRouteStatus(value: unknown): value is LiveOutputRouteStatus {
  return (
    value === 'disabled' ||
    value === 'available' ||
    value === 'active' ||
    value === 'unavailable' ||
    value === 'unsupported' ||
    value === 'permission-required'
  );
}

function isLiveCompositorDiagnosticSeverity(
  value: unknown,
): value is LiveCompositorDiagnosticSeverity {
  return value === 'info' || value === 'warning' || value === 'error';
}

function isLiveCompositorDiagnosticCode(value: unknown): value is LiveCompositorDiagnosticCode {
  return (
    value === 'unsupported-source' ||
    value === 'unsupported-output-route' ||
    value === 'unavailable-output-route' ||
    value === 'permission-required' ||
    value === 'stale-revision' ||
    value === 'latency-budget-exceeded' ||
    value === 'latency-unavailable' ||
    value === 'preview-non-authoritative'
  );
}

function isLiveCompositorLatencyKind(value: unknown): value is LiveCompositorLatencyKind {
  return (
    value === 'command-to-frame' ||
    value === 'tracking-to-frame' ||
    value === 'encode' ||
    value === 'decode' ||
    value === 'presentation' ||
    value === 'end-to-end'
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isVec2(value: unknown): value is LiveCompositorVec2 {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isRect(value: unknown): value is LiveCompositorRect {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function isAffine2D(value: unknown): value is LiveCompositorAffine2D {
  return Array.isArray(value) && value.length === 6 && value.every(isFiniteNumber);
}

function isOpacity(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}

function isSerializableRecord(value: unknown): value is ViewportSerializableRecord {
  return isRecord(value) && isViewportSerializableValue(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
