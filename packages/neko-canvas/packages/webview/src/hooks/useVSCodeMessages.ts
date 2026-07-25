/**
 * useVSCodeMessages - Handle VSCode extension ↔ webview communication
 *
 * Manages message listeners for canvas updates, keyboard actions,
 * locale changes, and media additions from the extension host.
 */

import { useEffect, useRef, useState } from 'react';
import { hasEditableActiveElement, isKeyboardFocusMessage } from '@neko/ui/keyboard';
import type {
  CanvasData,
  CanvasNode,
  CanonicalCanvasNodeType,
  OperationSource,
  CanvasCreateCompositeRequest,
  CanvasCreateConnectionRequest,
  CanvasDeriveNodeRequest,
  CanvasExtractStructuredContentRequest,
  CanvasAgentActiveContextRequest,
  CanvasAgentContentPayload,
  FieldBinding,
  CanvasUpdateBlockRequest,
  ProjectedCanvasStatus,
  ProjectionSourceChangeEvent,
  CanvasHostAppliedDocumentMessage,
} from '@neko/shared';
import {
  isCanvasNodeType,
  isJsonPointerPath,
  isProjectFileSnapshotRequestMessage,
  PROJECT_FILE_SNAPSHOT_RESPONSE,
} from '@neko/shared';
import { setLocale } from '../i18n';
import { useCanvasStore } from '../stores/canvasStore';
import { useCanvasOperationStore } from '../stores/canvasOperationStore';
import { isEditorLevelKeyboardAction } from './keyboardActionPolicy';

// =============================================================================
// Types
// =============================================================================

/** VSCode API handle (only available in webview context) */
export type VSCodeAPI = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
} | null;

export interface UseVSCodeMessagesOptions {
  vscode: VSCodeAPI;
  defaultCanvasData: CanvasData;
  setCanvasData: (data: CanvasData) => void;
  /** Reveals the same-Webview Canvas playback workspace from host commands or Agent actions. */
  onRevealPlaybackWorkspace?: (payload: {
    readonly routeId?: string;
    readonly currentUnitId?: string;
  }) => void;
  /** Return all nodes (optionally filtered by type) — used to respond to nodes.list requests */
  getNodes?: (type?: string) => CanvasNode[];
  /** Return a single node by id — used to respond to nodes.get requests */
  getNode?: (id: string) => CanvasNode | undefined;
  /** Update a node — used to respond to nodes.update requests */
  updateNode?: (id: string, data: Record<string, unknown>) => void;
  /** Create a node from the contract DTO — used to respond to nodes.create requests */
  createNode?: (node: {
    type: CanonicalCanvasNodeType;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }) => string;
  deriveNode?: (request: CanvasDeriveNodeRequest) => unknown;
  createConnection?: (request: CanvasCreateConnectionRequest) => unknown;
  createComposite?: (request: CanvasCreateCompositeRequest) => unknown;
  reorderGroupChildren?: (groupId: string, childIds: string[], autoLayout?: boolean) => unknown;
  updateBlock?: (request: CanvasUpdateBlockRequest) => unknown;
  extractStructuredContent?: (request: CanvasExtractStructuredContentRequest) => unknown;
  getActiveContext?: (request?: CanvasAgentActiveContextRequest) => unknown;
  applyAgentContent?: (payload: CanvasAgentContentPayload) => unknown;
  onProjectionStatus?: (status: ProjectedCanvasStatus) => void;
  onProjectionSourceChanged?: (event: ProjectionSourceChangeEvent) => void;
  /** Called after a Canvas document payload has been normalized and applied. */
  onCanvasDataLoaded?: (data: CanvasData) => void;
  /** Called after the extension confirms that the current custom document save completed. */
  onSaved?: () => void;
  onKeyboardFocusChange?: (focused: boolean) => void;
  isKeyboardFocusedRef?: React.MutableRefObject<boolean>;
  isComposingRef?: React.MutableRefObject<boolean>;
}

function withOperationSource<T>(source: OperationSource, run: () => T): T {
  return useCanvasOperationStore.getState().withOperationSource(source, run);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeFieldBinding(value: unknown): FieldBinding | undefined {
  if (!isRecord(value) || typeof value.path !== 'string' || !isJsonPointerPath(value.path)) {
    return undefined;
  }

  return {
    path: value.path,
    label: typeof value.label === 'string' ? value.label : undefined,
    valueType: isFieldValueType(value.valueType) ? value.valueType : undefined,
    mode: isFieldBindingMode(value.mode) ? value.mode : undefined,
    required: typeof value.required === 'boolean' ? value.required : undefined,
    defaultValue: value.defaultValue,
  };
}

function normalizeUpdateBlockRequest(payload: unknown): CanvasUpdateBlockRequest {
  const value = isRecord(payload) ? payload : {};
  const path =
    typeof value.path === 'string' && isJsonPointerPath(value.path) ? value.path : undefined;
  return {
    nodeId: typeof value.nodeId === 'string' ? value.nodeId : '',
    blockId: typeof value.blockId === 'string' ? value.blockId : undefined,
    path,
    binding: normalizeFieldBinding(value.binding),
    value: value.value,
  };
}

function isFieldBindingMode(value: unknown): value is FieldBinding['mode'] {
  return value === 'read' || value === 'write' || value === 'readwrite';
}

function isFieldValueType(value: unknown): value is FieldBinding['valueType'] {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'array' ||
    value === 'object' ||
    value === 'asset' ||
    value === 'unknown'
  );
}

export interface UseVSCodeMessagesReturn {
  isReady: boolean;
  loadDiagnostic: CanvasLoadDiagnostic | null;
  keyboardActionRef: React.MutableRefObject<(action: string) => void>;
}

export interface CanvasLoadDiagnostic {
  readonly code: string;
  readonly message: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useVSCodeMessages(options: UseVSCodeMessagesOptions): UseVSCodeMessagesReturn {
  const {
    vscode,
    defaultCanvasData,
    setCanvasData,
    onRevealPlaybackWorkspace,
    getNodes,
    getNode,
    updateNode,
    createNode,
    deriveNode,
    createConnection,
    createComposite,
    reorderGroupChildren,
    updateBlock,
    extractStructuredContent,
    getActiveContext,
    applyAgentContent,
    onProjectionStatus,
    onProjectionSourceChanged,
    onCanvasDataLoaded,
    onSaved,
    onKeyboardFocusChange,
    isKeyboardFocusedRef,
    isComposingRef,
  } = options;

  const [isReady, setIsReady] = useState(false);
  const [loadDiagnostic, setLoadDiagnostic] = useState<CanvasLoadDiagnostic | null>(null);
  const keyboardActionRef = useRef<(action: string) => void>(() => {});

  // Stable refs for callbacks to avoid re-registering listener
  const onRevealPlaybackWorkspaceRef = useRef(onRevealPlaybackWorkspace);
  onRevealPlaybackWorkspaceRef.current = onRevealPlaybackWorkspace;
  const getNodesRef = useRef(getNodes);
  getNodesRef.current = getNodes;
  const getNodeRef = useRef(getNode);
  getNodeRef.current = getNode;
  const updateNodeRef = useRef(updateNode);
  updateNodeRef.current = updateNode;
  const createNodeRef = useRef(createNode);
  createNodeRef.current = createNode;
  const deriveNodeRef = useRef(deriveNode);
  deriveNodeRef.current = deriveNode;
  const createConnectionRef = useRef(createConnection);
  createConnectionRef.current = createConnection;
  const createCompositeRef = useRef(createComposite);
  createCompositeRef.current = createComposite;
  const reorderGroupChildrenRef = useRef(reorderGroupChildren);
  reorderGroupChildrenRef.current = reorderGroupChildren;
  const updateBlockRef = useRef(updateBlock);
  updateBlockRef.current = updateBlock;
  const extractStructuredContentRef = useRef(extractStructuredContent);
  extractStructuredContentRef.current = extractStructuredContent;
  const getActiveContextRef = useRef(getActiveContext);
  getActiveContextRef.current = getActiveContext;
  const applyAgentContentRef = useRef(applyAgentContent);
  applyAgentContentRef.current = applyAgentContent;
  const onProjectionStatusRef = useRef(onProjectionStatus);
  onProjectionStatusRef.current = onProjectionStatus;
  const onProjectionSourceChangedRef = useRef(onProjectionSourceChanged);
  onProjectionSourceChangedRef.current = onProjectionSourceChanged;
  const onCanvasDataLoadedRef = useRef(onCanvasDataLoaded);
  onCanvasDataLoadedRef.current = onCanvasDataLoaded;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onKeyboardFocusChangeRef = useRef(onKeyboardFocusChange);
  onKeyboardFocusChangeRef.current = onKeyboardFocusChange;
  const isKeyboardFocusedRefRef = useRef(isKeyboardFocusedRef);
  isKeyboardFocusedRefRef.current = isKeyboardFocusedRef;
  const isComposingRefRef = useRef(isComposingRef);
  isComposingRefRef.current = isComposingRef;

  useEffect(() => {
    if (vscode) {
      const setComposing = (composing: boolean): void => {
        if (isComposingRefRef.current) {
          isComposingRefRef.current.current = composing;
        }
      };
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (isKeyboardFocusMessage(message)) {
          if (isKeyboardFocusedRefRef.current) {
            isKeyboardFocusedRefRef.current.current = message.focused;
          }
          onKeyboardFocusChangeRef.current?.(message.focused);
          return;
        }
        if (isProjectFileSnapshotRequestMessage(message)) {
          const document = useCanvasStore.getState().canvasData;
          vscode.postMessage({
            type: PROJECT_FILE_SNAPSHOT_RESPONSE,
            requestId: message.requestId,
            ok: Boolean(document),
            ...(document ? { document } : { error: 'Canvas document is not ready.' }),
          });
          return;
        }
        switch (message.type) {
          case 'update': {
            const canvasData = message.data ? (message.data as CanvasData) : defaultCanvasData;
            setLoadDiagnostic(null);
            setCanvasData(canvasData);
            onCanvasDataLoadedRef.current?.(canvasData);
            setIsReady(true);
            vscode.postMessage({ type: 'canvasDataReady' });
            break;
          }
          case 'canvas.loadFailed': {
            const diagnostic = message.diagnostic;
            if (
              !isRecord(diagnostic) ||
              typeof diagnostic.code !== 'string' ||
              typeof diagnostic.message !== 'string'
            ) {
              throw new Error('Invalid canvas.loadFailed diagnostic payload.');
            }
            setLoadDiagnostic({ code: diagnostic.code, message: diagnostic.message });
            setIsReady(false);
            break;
          }
          case 'canvas.hostAppliedDocument': {
            const hostMessage = message as CanvasHostAppliedDocumentMessage;
            setCanvasData(hostMessage.data);
            onCanvasDataLoadedRef.current?.(hostMessage.data);
            setIsReady(true);
            vscode.postMessage({ type: 'canvasDataReady' });
            break;
          }
          case 'keyboardAction':
            if (isKeyboardFocusedRefRef.current?.current === false) {
              break;
            }
            if (
              isEditorLevelKeyboardAction(message.action) &&
              (isComposingRefRef.current?.current || hasEditableActiveElement())
            ) {
              break;
            }
            keyboardActionRef.current(message.action as string);
            break;
          case 'playback:revealWorkspace':
            onRevealPlaybackWorkspaceRef.current?.({
              routeId: typeof message.routeId === 'string' ? message.routeId : undefined,
              currentUnitId: typeof message.unitId === 'string' ? message.unitId : undefined,
            });
            break;
          case 'setLocale':
            setLocale(message.locale as 'en' | 'zh-cn');
            break;
          case 'saved':
            onSavedRef.current?.();
            break;
          case 'projectionStatus':
            if (isRecord(message.status)) {
              onProjectionStatusRef.current?.(message.status as unknown as ProjectedCanvasStatus);
            }
            break;
          case 'projectionSourceChanged':
            if (isRecord(message.event)) {
              onProjectionSourceChangedRef.current?.(
                message.event as unknown as ProjectionSourceChangeEvent,
              );
            }
            break;

          // ----------------------------------------------------------------
          // nodes.* — request/response API for MCP Canvas tools
          // The extension sends { type, _requestId, ...dto } and expects
          // { type: '_response', _requestId, ...result } back.
          // ----------------------------------------------------------------
          case 'nodes.list': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            const typeFilter = message.nodeType as string | undefined;
            if (typeFilter !== undefined && !isCanvasNodeType(typeFilter)) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: `Unsupported Canvas node type "${typeFilter}"`,
              });
              break;
            }
            const nodes = getNodesRef.current?.(typeFilter) ?? [];
            vscode.postMessage({ type: '_response', _requestId: requestId, nodes });
            break;
          }
          case 'nodes.get': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            const node = getNodeRef.current?.(message.nodeId as string) ?? null;
            vscode.postMessage({ type: '_response', _requestId: requestId, node });
            break;
          }
          case 'nodes.update': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            withOperationSource('ai', () => {
              updateNodeRef.current?.(
                message.nodeId as string,
                (message.data as Record<string, unknown>) ?? {},
              );
            });
            vscode.postMessage({ type: '_response', _requestId: requestId, success: true });
            break;
          }
          case 'nodes.create': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            const payload = (message.payload as
              | {
                  type?: unknown;
                  position?: { x: number; y: number };
                  data?: Record<string, unknown>;
                  preset?: string;
                }
              | undefined) ?? { data: {} };
            const type = payload.type ?? 'markdown';
            if (!isCanvasNodeType(type)) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: `Unsupported Canvas node type "${String(type)}"`,
              });
              break;
            }
            try {
              const id = withOperationSource(
                'ai',
                () =>
                  createNodeRef.current?.({
                    type: type as CanonicalCanvasNodeType,
                    position: payload.position ?? { x: 0, y: 0 },
                    data: payload.data ?? {},
                  }) ?? '',
              );
              vscode.postMessage({ type: '_response', _requestId: requestId, nodeId: id });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.derive': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const result = withOperationSource('ai', () =>
                deriveNodeRef.current?.(
                  (message.payload as CanvasDeriveNodeRequest | undefined) ?? {
                    sourceNodeId: '',
                  },
                ),
              );
              if (!isRecord(result)) {
                throw new Error('Derive operation failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.createConnection': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const result = withOperationSource('ai', () =>
                createConnectionRef.current?.(
                  (message.payload as CanvasCreateConnectionRequest | undefined) ?? {
                    sourceId: '',
                    targetId: '',
                  },
                ),
              );
              if (!isRecord(result)) {
                throw new Error('Connection creation failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.createComposite': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const result = withOperationSource('ai', () =>
                createCompositeRef.current?.(
                  (message.payload as CanvasCreateCompositeRequest | undefined) ?? {
                    children: [],
                  },
                ),
              );
              if (!isRecord(result)) {
                throw new Error('Composite creation failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.reorderGroupChildren': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const payload = message.payload;
              if (
                !isRecord(payload) ||
                typeof payload.groupId !== 'string' ||
                !isStringArray(payload.childIds)
              ) {
                throw new Error('Group reorder requires groupId and childIds');
              }
              const groupId = payload.groupId;
              const childIds = payload.childIds;
              const autoLayout = payload.autoLayout === true;
              const result = withOperationSource('ai', () =>
                reorderGroupChildrenRef.current?.(groupId, childIds, autoLayout),
              );
              if (!isRecord(result)) {
                throw new Error('Group reorder failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.updateBlock': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const result = withOperationSource('ai', () =>
                updateBlockRef.current?.(normalizeUpdateBlockRequest(message.payload)),
              );
              if (!isRecord(result)) {
                throw new Error('Block update failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.extractStructuredContent': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              // Read-only query: no operation source override because no edit operation is recorded.
              const result = extractStructuredContentRef.current?.(
                (message.payload as CanvasExtractStructuredContentRequest | undefined) ?? {
                  format: 'json',
                },
              );
              if (!isRecord(result)) {
                throw new Error('Structured content extraction failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.getActiveContext': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const result = getActiveContextRef.current?.(
                (message.payload as CanvasAgentActiveContextRequest | undefined) ?? {},
              );
              if (!isRecord(result)) {
                throw new Error('Active context query failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
          case 'nodes.applyAgentContent': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            try {
              const result = withOperationSource('ai', () =>
                applyAgentContentRef.current?.(
                  (message.payload as CanvasAgentContentPayload | undefined) ?? {
                    kind: 'text',
                    text: '',
                  },
                ),
              );
              if (!isRecord(result)) {
                throw new Error('Agent content application failed');
              }
              vscode.postMessage({ type: '_response', _requestId: requestId, ...result });
            } catch (error) {
              vscode.postMessage({
                type: '_response',
                _requestId: requestId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }
        }
      };

      const handleCompositionStart = (): void => setComposing(true);
      const handleCompositionEnd = (): void => setComposing(false);
      window.addEventListener('compositionstart', handleCompositionStart);
      window.addEventListener('compositionend', handleCompositionEnd);
      window.addEventListener('message', handleMessage);
      vscode.postMessage({ type: 'ready' });

      return () => {
        window.removeEventListener('message', handleMessage);
        window.removeEventListener('compositionstart', handleCompositionStart);
        window.removeEventListener('compositionend', handleCompositionEnd);
      };
    } else {
      setCanvasData(defaultCanvasData);
      onCanvasDataLoadedRef.current?.(defaultCanvasData);
      setIsReady(true);
    }
  }, [vscode, setCanvasData, defaultCanvasData]);

  return { isReady, loadDiagnostic, keyboardActionRef };
}
