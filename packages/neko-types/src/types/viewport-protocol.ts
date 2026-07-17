// =============================================================================
// Unified Viewport Protocol - L0 shared contracts
//
// Pure DTOs and guards only. React/DOM/VSCode/Node types belong in UI or host
// layers, not in this file.
// =============================================================================

export const VIEWPORT_PROTOCOL_VERSION = 1 as const;

export type ViewportProtocolVersion = typeof VIEWPORT_PROTOCOL_VERSION;
export type ViewportDomain = 'viewport' | 'scene';
export type ViewportCommandSource = 'user' | 'agent' | 'script' | 'system' | 'replay';
export type ViewportSceneType = '2d' | '3d' | 'live';
export type ViewportControlConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'closed';
export type ViewportCommandLifecycleState =
  | 'queued'
  | 'sent'
  | 'ack'
  | 'error'
  | 'timeout'
  | 'superseded'
  | 'resyncing';
export type ViewportMetadataFreshnessState =
  | 'fresh'
  | 'missing'
  | 'delayed'
  | 'stale'
  | 'superseded'
  | 'ack-before-frame';
export type ViewportDegradedReason =
  | 'control-disconnected'
  | 'control-reconnecting'
  | 'command-rejected'
  | 'query-failed'
  | 'snapshot-stale'
  | 'metadata-delayed'
  | 'metadata-missing'
  | 'metadata-stale'
  | 'ack-before-frame'
  | 'video-backpressure'
  | 'unknown';

export type ViewportSerializableValue =
  | null
  | string
  | number
  | boolean
  | ViewportSerializableValue[]
  | { readonly [key: string]: ViewportSerializableValue };

export type ViewportSerializableRecord = {
  readonly [key: string]: ViewportSerializableValue;
};

export type ViewportVec2 = readonly [number, number];
export type ViewportVec3 = readonly [number, number, number];
export type ViewportAffine2D = readonly [number, number, number, number, number, number];

export interface ViewportCommand<
  TPayload extends ViewportSerializableRecord = ViewportSerializableRecord,
> {
  readonly protocolVersion: ViewportProtocolVersion;
  readonly domain: ViewportDomain;
  readonly action: string;
  readonly sceneId: string;
  readonly viewportId?: string;
  readonly seq: number;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly source: ViewportCommandSource;
  readonly baseRevision?: number;
  readonly payload: TPayload;
}

export type ViewportEventStatus = 'ack' | 'error' | 'event' | 'resync';

export interface ViewportProtocolError {
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
}

export interface ViewportEvent<
  TPayload extends ViewportSerializableRecord = ViewportSerializableRecord,
> {
  readonly protocolVersion: ViewportProtocolVersion;
  readonly domain: ViewportDomain;
  readonly event: string;
  readonly sceneId: string;
  readonly viewportId?: string;
  readonly ackSeq: number;
  readonly revision: number;
  readonly timestamp: number;
  readonly status?: ViewportEventStatus;
  readonly appliedSeq?: number;
  readonly error?: ViewportProtocolError;
  readonly payload: TPayload;
}

export interface ViewportFrameMeta {
  readonly protocolVersion: ViewportProtocolVersion;
  readonly streamId: string;
  readonly sceneId: string;
  readonly viewportId: string;
  readonly frameId: number;
  readonly ptsUs: number;
  readonly durationUs: number;
  readonly frameTimestamp: number;
  /** Canonical scene revision for viewport prediction and overlay validation. */
  readonly revision: number;
  /** Bridge field for existing EngineRenderFrameMeta.sceneRevision contracts. */
  readonly sceneRevision?: number;
  readonly appliedSeq: number;
  readonly viewTransform: ViewportAffine2D;
  readonly projection?: ViewportSerializableRecord;
  readonly diagnostics?: ViewportSerializableRecord;
}

export interface ViewportMetadataEvent<TMeta extends ViewportFrameMeta = ViewportFrameMeta> {
  readonly protocolVersion: ViewportProtocolVersion;
  readonly type: 'viewportMetadata';
  readonly sceneId: string;
  readonly viewportId: string;
  readonly revision: number;
  readonly appliedSeq: number;
  readonly timestamp: number;
  readonly transport: 'scene-control';
  readonly cadence: 'ack-correlated' | 'periodic' | 'on-demand';
  readonly meta: TMeta;
}

export interface ViewportControlFlowDiagnostic<
  TDetails extends ViewportSerializableRecord = ViewportSerializableRecord,
> {
  readonly kind: 'connection' | 'command' | 'query' | 'snapshot' | 'metadata' | 'prediction';
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly sceneId?: string;
  readonly viewportId?: string;
  readonly streamId?: string;
  readonly seq?: number;
  readonly correlationId?: string;
  readonly revision?: number;
  readonly appliedSeq?: number;
  readonly connectionState?: ViewportControlConnectionState;
  readonly commandState?: ViewportCommandLifecycleState;
  readonly metadataState?: ViewportMetadataFreshnessState;
  readonly degradedReason?: ViewportDegradedReason;
  readonly timestamp: number;
  readonly details?: TDetails;
}

export type ViewportPointerType = 'mouse' | 'pen' | 'touch' | 'unknown';
export type ViewportPointerPhase = 'down' | 'move' | 'up' | 'cancel';
export type ViewportKeyPhase = 'down' | 'up';
export type ViewportWheelDeltaMode = 'pixel' | 'line' | 'page';

export interface ViewportModifierState {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly space?: boolean;
}

export interface ViewportInputBase {
  readonly sceneId: string;
  readonly viewportId: string;
  readonly timestamp: number;
  readonly modifiers: ViewportModifierState;
}

export interface ViewportPointerInput extends ViewportInputBase {
  readonly kind: 'pointer';
  readonly phase: ViewportPointerPhase;
  readonly pointerId: number;
  readonly pointerType: ViewportPointerType;
  readonly position: ViewportVec2;
  readonly buttons: number;
  readonly button?: number;
  readonly pressure?: number;
  readonly worldPosition?: ViewportVec3;
}

export interface ViewportWheelInput extends ViewportInputBase {
  readonly kind: 'wheel';
  readonly position: ViewportVec2;
  readonly delta: ViewportVec2;
  readonly deltaMode: ViewportWheelDeltaMode;
}

export interface ViewportKeyInput extends ViewportInputBase {
  readonly kind: 'key';
  readonly phase: ViewportKeyPhase;
  readonly key: string;
  readonly code?: string;
  readonly repeat?: boolean;
}

export type ViewportInputEvent = ViewportPointerInput | ViewportWheelInput | ViewportKeyInput;

export type ViewportOverlayKind = 'polyline' | 'points' | 'rect' | 'mesh' | 'text' | 'custom';
export type ViewportOverlayCoordinateSpace = 'world' | 'scene' | 'viewport' | 'screen';
export type ViewportOverlayStalePolicy = 'hide' | 'dim' | 'draw-as-prediction';

export interface ViewportOverlayStyle {
  readonly stroke?: string;
  readonly fill?: string;
  readonly lineWidth?: number;
  readonly opacity?: number;
  readonly dash?: readonly number[];
}

export interface ViewportOverlayDescriptor<
  TPayload extends ViewportSerializableRecord = ViewportSerializableRecord,
> {
  readonly id: string;
  readonly kind: ViewportOverlayKind;
  readonly sceneId?: string;
  readonly viewportId: string;
  readonly coordinateSpace: ViewportOverlayCoordinateSpace;
  readonly revision?: number;
  readonly appliedSeq?: number;
  readonly zIndex?: number;
  readonly authoritative?: boolean;
  readonly stalePolicy?: ViewportOverlayStalePolicy;
  readonly style?: ViewportOverlayStyle;
  readonly payload: TPayload;
}

export type ViewportToolbarItemKind =
  | 'button'
  | 'toggle'
  | 'select'
  | 'slider'
  | 'separator'
  | 'custom';

export interface ViewportToolbarOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ViewportToolbarItem<
  TValue extends ViewportSerializableValue = ViewportSerializableValue,
> {
  readonly id: string;
  readonly kind: ViewportToolbarItemKind;
  readonly label?: string;
  readonly icon?: string;
  readonly action?: string;
  readonly group?: string;
  readonly order?: number;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly degraded?: boolean;
  readonly degradedReason?: ViewportDegradedReason;
  readonly toggled?: boolean;
  readonly value?: TValue;
  readonly options?: readonly ViewportToolbarOption[];
  readonly payload?: ViewportSerializableRecord;
}

export interface ViewportMenuItem {
  readonly id: string;
  readonly label: string;
  readonly action?: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly children?: readonly ViewportMenuItem[];
  readonly payload?: ViewportSerializableRecord;
}

export interface ViewportContextMenuRequest extends ViewportInputBase {
  readonly position: ViewportVec2;
  readonly hit?: ViewportSerializableRecord;
}

export interface ViewportControllerResult {
  readonly commands?: readonly ViewportCommand[];
  readonly overlays?: readonly ViewportOverlayDescriptor[];
  readonly diagnostics?: readonly string[];
}

export type ViewportControllerMaybePromise<T> = T | Promise<T>;

export interface ISceneController {
  readonly sceneId: string;
  readonly sceneType: ViewportSceneType;
  onPointerDown(
    input: ViewportPointerInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  onPointerMove(
    input: ViewportPointerInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  onPointerUp(
    input: ViewportPointerInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  onPointerCancel?(
    input: ViewportPointerInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  onWheel(
    input: ViewportWheelInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  onKeyDown(
    input: ViewportKeyInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  onKeyUp?(
    input: ViewportKeyInput,
  ): ViewportControllerMaybePromise<ViewportControllerResult | void>;
  getOverlays(frame?: ViewportFrameMeta): readonly ViewportOverlayDescriptor[];
  getToolbarExtensions(): readonly ViewportToolbarItem[];
  getContextMenu(request: ViewportContextMenuRequest): readonly ViewportMenuItem[];
  handleViewportEvent(event: ViewportEvent): ViewportControllerMaybePromise<void>;
}

export type ViewportPayloadGuard<
  TPayload extends ViewportSerializableRecord = ViewportSerializableRecord,
> = (payload: unknown, command: Pick<ViewportCommand, 'domain' | 'action'>) => payload is TPayload;

export interface ViewportPayloadGuardRegistry {
  register(
    domain: ViewportDomain,
    action: string,
    guard: ViewportPayloadGuard,
  ): ViewportPayloadGuardRegistry;
  get(domain: ViewportDomain, action: string): ViewportPayloadGuard | undefined;
  validateCommand(command: ViewportCommand): boolean;
}

export function isViewportProtocolVersion(value: unknown): value is ViewportProtocolVersion {
  return value === VIEWPORT_PROTOCOL_VERSION;
}

export function isViewportSerializableValue(value: unknown): value is ViewportSerializableValue {
  return isSerializableValue(value, 0);
}

export function isViewportCommand(value: unknown): value is ViewportCommand {
  if (!isRecord(value)) return false;
  if (
    !isViewportProtocolVersion(value['protocolVersion']) ||
    !isViewportDomain(value['domain']) ||
    typeof value['action'] !== 'string' ||
    typeof value['sceneId'] !== 'string' ||
    !isNonNegativeInteger(value['seq']) ||
    typeof value['correlationId'] !== 'string' ||
    !isFiniteNumber(value['timestamp']) ||
    !isViewportCommandSource(value['source']) ||
    !isViewportSerializableRecord(value['payload'])
  ) {
    return false;
  }
  return (
    (value['viewportId'] === undefined || typeof value['viewportId'] === 'string') &&
    (value['baseRevision'] === undefined || isNonNegativeInteger(value['baseRevision'])) &&
    isActionInDomain(value['domain'], value['action'])
  );
}

export function isViewportEvent(value: unknown): value is ViewportEvent {
  if (!isRecord(value)) return false;
  return (
    isViewportProtocolVersion(value['protocolVersion']) &&
    isViewportDomain(value['domain']) &&
    typeof value['event'] === 'string' &&
    typeof value['sceneId'] === 'string' &&
    (value['viewportId'] === undefined || typeof value['viewportId'] === 'string') &&
    isNonNegativeInteger(value['ackSeq']) &&
    isNonNegativeInteger(value['revision']) &&
    isFiniteNumber(value['timestamp']) &&
    (value['status'] === undefined || isViewportEventStatus(value['status'])) &&
    (value['appliedSeq'] === undefined || isNonNegativeInteger(value['appliedSeq'])) &&
    (value['error'] === undefined || isViewportProtocolError(value['error'])) &&
    isViewportSerializableRecord(value['payload'])
  );
}

export function isViewportFrameMeta(value: unknown): value is ViewportFrameMeta {
  if (!isRecord(value)) return false;
  return (
    isViewportProtocolVersion(value['protocolVersion']) &&
    typeof value['streamId'] === 'string' &&
    typeof value['sceneId'] === 'string' &&
    typeof value['viewportId'] === 'string' &&
    isNonNegativeInteger(value['frameId']) &&
    isNonNegativeInteger(value['ptsUs']) &&
    isNonNegativeInteger(value['durationUs']) &&
    isFiniteNumber(value['frameTimestamp']) &&
    isNonNegativeInteger(value['revision']) &&
    (value['sceneRevision'] === undefined || isNonNegativeInteger(value['sceneRevision'])) &&
    isNonNegativeInteger(value['appliedSeq']) &&
    isViewportAffine2D(value['viewTransform']) &&
    (value['projection'] === undefined || isViewportSerializableRecord(value['projection'])) &&
    (value['diagnostics'] === undefined || isViewportSerializableRecord(value['diagnostics']))
  );
}

export function isViewportMetadataEvent(value: unknown): value is ViewportMetadataEvent {
  if (!isRecord(value)) return false;
  return (
    isViewportProtocolVersion(value['protocolVersion']) &&
    value['type'] === 'viewportMetadata' &&
    typeof value['sceneId'] === 'string' &&
    typeof value['viewportId'] === 'string' &&
    isNonNegativeInteger(value['revision']) &&
    isNonNegativeInteger(value['appliedSeq']) &&
    isFiniteNumber(value['timestamp']) &&
    isViewportMetadataTransport(value['transport']) &&
    isViewportMetadataCadence(value['cadence']) &&
    isViewportFrameMeta(value['meta'])
  );
}

export function isViewportControlFlowDiagnostic(
  value: unknown,
): value is ViewportControlFlowDiagnostic {
  if (!isRecord(value)) return false;
  return (
    isViewportDiagnosticKind(value['kind']) &&
    isViewportDiagnosticSeverity(value['severity']) &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['sceneId'] === undefined || typeof value['sceneId'] === 'string') &&
    (value['viewportId'] === undefined || typeof value['viewportId'] === 'string') &&
    (value['streamId'] === undefined || typeof value['streamId'] === 'string') &&
    (value['seq'] === undefined || isNonNegativeInteger(value['seq'])) &&
    (value['correlationId'] === undefined || typeof value['correlationId'] === 'string') &&
    (value['revision'] === undefined || isNonNegativeInteger(value['revision'])) &&
    (value['appliedSeq'] === undefined || isNonNegativeInteger(value['appliedSeq'])) &&
    (value['connectionState'] === undefined ||
      isViewportControlConnectionState(value['connectionState'])) &&
    (value['commandState'] === undefined ||
      isViewportCommandLifecycleState(value['commandState'])) &&
    (value['metadataState'] === undefined ||
      isViewportMetadataFreshnessState(value['metadataState'])) &&
    (value['degradedReason'] === undefined || isViewportDegradedReason(value['degradedReason'])) &&
    isFiniteNumber(value['timestamp']) &&
    (value['details'] === undefined || isViewportSerializableRecord(value['details']))
  );
}

export function isViewportOverlayDescriptor(value: unknown): value is ViewportOverlayDescriptor {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isViewportOverlayKind(value['kind']) &&
    (value['sceneId'] === undefined || typeof value['sceneId'] === 'string') &&
    typeof value['viewportId'] === 'string' &&
    isViewportOverlayCoordinateSpace(value['coordinateSpace']) &&
    (value['revision'] === undefined || isNonNegativeInteger(value['revision'])) &&
    (value['appliedSeq'] === undefined || isNonNegativeInteger(value['appliedSeq'])) &&
    (value['zIndex'] === undefined || isFiniteNumber(value['zIndex'])) &&
    (value['authoritative'] === undefined || typeof value['authoritative'] === 'boolean') &&
    (value['stalePolicy'] === undefined || isViewportOverlayStalePolicy(value['stalePolicy'])) &&
    (value['style'] === undefined || isViewportOverlayStyle(value['style'])) &&
    isViewportSerializableRecord(value['payload'])
  );
}

export function isViewportToolbarItem(value: unknown): value is ViewportToolbarItem {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isViewportToolbarItemKind(value['kind']) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['icon'] === undefined || typeof value['icon'] === 'string') &&
    (value['action'] === undefined || typeof value['action'] === 'string') &&
    (value['group'] === undefined || typeof value['group'] === 'string') &&
    (value['order'] === undefined || isFiniteNumber(value['order'])) &&
    (value['disabled'] === undefined || typeof value['disabled'] === 'boolean') &&
    (value['disabledReason'] === undefined || typeof value['disabledReason'] === 'string') &&
    (value['degraded'] === undefined || typeof value['degraded'] === 'boolean') &&
    (value['degradedReason'] === undefined || isViewportDegradedReason(value['degradedReason'])) &&
    (value['toggled'] === undefined || typeof value['toggled'] === 'boolean') &&
    (value['value'] === undefined || isViewportSerializableValue(value['value'])) &&
    (value['options'] === undefined || isArrayOf(value['options'], isViewportToolbarOption)) &&
    (value['payload'] === undefined || isViewportSerializableRecord(value['payload']))
  );
}

export function createViewportPayloadGuardRegistry(
  entries: readonly (readonly [ViewportDomain, string, ViewportPayloadGuard])[] = [],
): ViewportPayloadGuardRegistry {
  const guards = new Map<string, ViewportPayloadGuard>();

  const registry: ViewportPayloadGuardRegistry = {
    register(domain, action, guard) {
      guards.set(payloadGuardKey(domain, action), guard);
      return registry;
    },
    get(domain, action) {
      return guards.get(payloadGuardKey(domain, action));
    },
    validateCommand(command) {
      const guard = guards.get(payloadGuardKey(command.domain, command.action));
      return guard === undefined ? true : guard(command.payload, command);
    },
  };

  for (const [domain, action, guard] of entries) {
    registry.register(domain, action, guard);
  }

  return registry;
}

export function validateViewportCommandPayload(
  command: ViewportCommand,
  registry: ViewportPayloadGuardRegistry,
): boolean {
  return registry.validateCommand(command);
}

function payloadGuardKey(domain: ViewportDomain, action: string): string {
  return `${domain}:${action}`;
}

function isViewportDomain(value: unknown): value is ViewportDomain {
  return value === 'viewport' || value === 'scene';
}

function isViewportCommandSource(value: unknown): value is ViewportCommandSource {
  return (
    value === 'user' ||
    value === 'agent' ||
    value === 'script' ||
    value === 'system' ||
    value === 'replay'
  );
}

function isActionInDomain(domain: ViewportDomain, action: string): boolean {
  return domain === 'viewport' ? action.startsWith('viewport:') : action.startsWith('scene:');
}

function isViewportEventStatus(value: unknown): value is ViewportEventStatus {
  return value === 'ack' || value === 'error' || value === 'event' || value === 'resync';
}

function isViewportControlConnectionState(value: unknown): value is ViewportControlConnectionState {
  return (
    value === 'disconnected' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'reconnecting' ||
    value === 'degraded' ||
    value === 'closed'
  );
}

function isViewportCommandLifecycleState(value: unknown): value is ViewportCommandLifecycleState {
  return (
    value === 'queued' ||
    value === 'sent' ||
    value === 'ack' ||
    value === 'error' ||
    value === 'timeout' ||
    value === 'superseded' ||
    value === 'resyncing'
  );
}

function isViewportMetadataFreshnessState(value: unknown): value is ViewportMetadataFreshnessState {
  return (
    value === 'fresh' ||
    value === 'missing' ||
    value === 'delayed' ||
    value === 'stale' ||
    value === 'superseded' ||
    value === 'ack-before-frame'
  );
}

function isViewportMetadataTransport(value: unknown): value is ViewportMetadataEvent['transport'] {
  return value === 'scene-control';
}

function isViewportMetadataCadence(value: unknown): value is ViewportMetadataEvent['cadence'] {
  return value === 'ack-correlated' || value === 'periodic' || value === 'on-demand';
}

function isViewportDegradedReason(value: unknown): value is ViewportDegradedReason {
  return (
    value === 'control-disconnected' ||
    value === 'control-reconnecting' ||
    value === 'command-rejected' ||
    value === 'query-failed' ||
    value === 'snapshot-stale' ||
    value === 'metadata-delayed' ||
    value === 'metadata-missing' ||
    value === 'metadata-stale' ||
    value === 'ack-before-frame' ||
    value === 'video-backpressure' ||
    value === 'unknown'
  );
}

function isViewportDiagnosticKind(value: unknown): value is ViewportControlFlowDiagnostic['kind'] {
  return (
    value === 'connection' ||
    value === 'command' ||
    value === 'query' ||
    value === 'snapshot' ||
    value === 'metadata' ||
    value === 'prediction'
  );
}

function isViewportDiagnosticSeverity(
  value: unknown,
): value is ViewportControlFlowDiagnostic['severity'] {
  return value === 'info' || value === 'warning' || value === 'error';
}

function isViewportProtocolError(value: unknown): value is ViewportProtocolError {
  if (!isRecord(value)) return false;
  return (
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['retryable'] === undefined || typeof value['retryable'] === 'boolean')
  );
}

function isViewportAffine2D(value: unknown): value is ViewportAffine2D {
  return Array.isArray(value) && value.length === 6 && value.every((item) => isFiniteNumber(item));
}

function isViewportOverlayKind(value: unknown): value is ViewportOverlayKind {
  return (
    value === 'polyline' ||
    value === 'points' ||
    value === 'rect' ||
    value === 'mesh' ||
    value === 'text' ||
    value === 'custom'
  );
}

function isViewportOverlayCoordinateSpace(value: unknown): value is ViewportOverlayCoordinateSpace {
  return value === 'world' || value === 'scene' || value === 'viewport' || value === 'screen';
}

function isViewportOverlayStalePolicy(value: unknown): value is ViewportOverlayStalePolicy {
  return value === 'hide' || value === 'dim' || value === 'draw-as-prediction';
}

function isViewportOverlayStyle(value: unknown): value is ViewportOverlayStyle {
  if (!isRecord(value)) return false;
  return (
    (value['stroke'] === undefined || typeof value['stroke'] === 'string') &&
    (value['fill'] === undefined || typeof value['fill'] === 'string') &&
    (value['lineWidth'] === undefined || isFiniteNumber(value['lineWidth'])) &&
    (value['opacity'] === undefined || isFiniteNumber(value['opacity'])) &&
    (value['dash'] === undefined ||
      (Array.isArray(value['dash']) && value['dash'].every((item) => isFiniteNumber(item))))
  );
}

function isViewportToolbarItemKind(value: unknown): value is ViewportToolbarItemKind {
  return (
    value === 'button' ||
    value === 'toggle' ||
    value === 'select' ||
    value === 'slider' ||
    value === 'separator' ||
    value === 'custom'
  );
}

function isViewportToolbarOption(value: unknown): value is ViewportToolbarOption {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['label'] === 'string' &&
    (value['disabled'] === undefined || typeof value['disabled'] === 'boolean')
  );
}

function isViewportSerializableRecord(value: unknown): value is ViewportSerializableRecord {
  return isRecord(value) && isViewportSerializableValue(value);
}

function isSerializableValue(value: unknown, depth: number): value is ViewportSerializableValue {
  if (depth > 32) return false;
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
      if (!isSerializableValue(value[index], depth + 1)) return false;
    }
    return true;
  }
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => isSerializableValue(item, depth + 1));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
