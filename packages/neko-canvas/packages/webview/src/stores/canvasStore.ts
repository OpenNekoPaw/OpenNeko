import { create } from 'zustand';
import type {
  CanvasData,
  CanvasNode,
  CanvasConnection,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  CanvasUpsertNarrativeProductionBindingRequest,
  CanvasUpsertNarrativeProductionBindingResult,
  PortDefinition,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from '@neko/shared';
import {
  getDefaultPorts,
  arePortTypesCompatible,
  createNodeConnectionEndpoint,
  createPortConnectionEndpoint,
  isSceneGroupNode,
  isShotNode,
  getContainerChildIds,
  getContainerPolicyName,
  getNodeParentId,
  isContainerNode,
  applyCanvasSubsystemMetadataDefaults,
  isNarrativeEndingNode,
  isNarrativeStartNode,
  isNarrativeTraversalNode,
} from '@neko/shared';
import { useHistoryStore } from './historyStore';
import { useCanvasOperationStore } from './canvasOperationStore';
import {
  addContainerChild,
  addGalleryChild,
  deleteContainerSubtree,
  getContainerDescendantIds,
  releaseContainerChildren,
  removeContainerChild,
  removeGalleryChild,
  reorderContainerChildren,
  translateContainerSubtree,
} from '../utils/containerActions';
import { autoArrangeContainer, computeContainerChildSize } from '../utils/containerLayout';
import { NODE_DEFAULT_SIZES } from '../utils/nodeFactory';
import { hydrateCanvasNodePreview, refreshCanvasNodePreview } from '../utils/canvasPresetRegistry';
import {
  createCanvasComposite,
  deriveCanvasNode,
  extractStructuredCanvasContent,
  applyCanvasAgentContent,
  upsertCanvasNarrativeProductionBinding,
  updateCanvasBlock,
} from '../utils/canvasAgentOperations';
import {
  clampNodeSize,
  clampNodeStoredSize,
  clampNodeStoredSizes,
  resolveNodeMinSize,
} from '../utils/nodeSizing';
import { createsDisallowedConnectionCycle } from '../utils/connectionProjection';
import { resolveCanvasDropContainer } from '../utils/containerMembership';
import {
  arrangeSpatialGroup,
  clampSpatialGroupResize,
  expandSpatialGroupToIncludeChild,
  fitSpatialGroupToContent,
  setSpatialGroupCollapsed,
  type SpatialGroupSort,
} from '../utils/spatialGroupLayout';

// =============================================================================
// Types
// =============================================================================

export interface CanvasSelection {
  nodeIds: string[];
  connectionIds: string[];
}

export interface GenerationPanelState {
  visible: boolean;
  /** Target ShotNode or GalleryNode ID */
  nodeId: string | null;
  /** Target gallery child node ID (null = shot-level generation) */
  childNodeId?: string | null;
  /** Pre-filled prompt from AutoPrompt or shot.visualDescription */
  initialPrompt?: string;
  /** Pre-fill ControlNet mode (from "ControlNet Edit" menu) */
  initialControlMode?: string;
  /** Pre-fill video generation mode (from "Generate Video" menu) */
  initialGenerateVideo?: boolean;
}

export interface CanvasStore {
  // ==================== State ====================
  canvasData: CanvasData | null;
  selection: CanvasSelection;
  isConnecting: boolean;
  pendingConnectionSource: { nodeId: string; handleId: string } | null;
  /** Currently playing media node ID (only one at a time) */
  activePlayingNodeId: string | null;
  /** Explicit inline expanded node, used by the subsystem-aware shell. */
  expandedNodeId: string | null;
  /** Generation prompt panel state */
  generationPanelState: GenerationPanelState;
  /** Content overlay state (fullscreen node content viewer) */
  contentOverlayState: { visible: boolean; nodeId: string | null };

  // ==================== Generation Panel Actions ====================
  openGenerationPanel: (
    nodeId: string,
    childNodeId?: string,
    initialPrompt?: string,
    opts?: { controlMode?: string; generateVideo?: boolean },
  ) => void;
  closeGenerationPanel: () => void;

  // ==================== Content Overlay Actions ====================
  openContentOverlay: (nodeId: string) => void;
  closeContentOverlay: () => void;

  // ==================== Data Actions ====================
  setCanvasData: (data: CanvasData) => void;
  updateCanvasData: (updates: Partial<CanvasData>, options?: { dirty?: boolean }) => void;
  setPlaybackEntry: (nodeId: string) => void;

  // ==================== Node Actions ====================
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  addNodes: (nodes: Array<Omit<CanvasNode, 'id'>>) => string[];
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  /** Record history + update position (call on drag end) */
  moveNodeEnd: (id: string, position: { x: number; y: number }) => void;
  /** Record history + final resize (call on resize end) */
  resizeNodeEnd: (
    id: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Record history + final rotation (call on rotate end) */
  rotateNodeEnd: (id: string, rotation: number) => void;
  /** Assign existing ShotNodes into a SceneGroupNode and optionally auto-layout them */
  assignShotsToScene: (sceneId: string, shotIds: string[], autoLayout?: boolean) => void;
  /** Reorder existing ShotNodes within a SceneGroupNode */
  reorderSceneShots: (sceneId: string, shotIds: string[], autoLayout?: boolean) => void;
  /** Auto-layout all shots owned by a scene using the current shotIds order */
  autoLayoutSceneShots: (sceneId: string) => void;
  /** Detach a ShotNode from its parent SceneGroupNode (keeps the shot on canvas) */
  detachShotFromScene: (sceneId: string, shotId: string) => void;

  /** Update node port definitions (records history) */
  updateNodePorts: (id: string, ports: PortDefinition[]) => void;

  // ==================== Reorder Actions ====================
  /** Reorder a node to a new zIndex (for layer panel drag) */
  reorderNode: (id: string, newZIndex: number) => void;

  // ==================== Container Actions ====================
  /** Remove a child from its container. Gallery delete-subtree: also deletes the child node. Others: release only. */
  removeChildFromContainer: (containerId: string, childId: string) => void;

  // ==================== Group Actions ====================
  /** Group selected nodes into an existing or new group */
  groupNodes: (childIds: string[]) => string;
  /** Ungroup: remove group node, release children */
  ungroupNodes: (groupId: string) => void;
  arrangeGroup: (groupId: string, sort: SpatialGroupSort) => void;
  fitGroupToContent: (groupId: string) => void;
  setGroupCollapsed: (groupId: string, collapsed: boolean) => void;

  // ==================== Connection Actions ====================
  addConnection: (connection: Omit<CanvasConnection, 'id'>) => string;
  updateConnection: (id: string, updates: Partial<CanvasConnection>) => void;
  removeConnection: (id: string) => void;
  startConnection: (nodeId: string, handleId: string) => void;
  completeConnection: (nodeId: string, handleId: string) => void;
  cancelConnection: () => void;

  // ==================== Derive Actions ====================
  /** Create a successor node positioned to the right, auto-connected. Uses targetType if given, else same type as source. */
  deriveSuccessorNode: (sourceNodeId: string, targetType?: string) => string | null;
  /** API/Agent derive path using preset, placement, and connection contracts. */
  deriveNode: (request: CanvasDeriveNodeRequest) => CanvasDeriveNodeResult | null;
  /** API/Agent atomic composite creation path. */
  createComposite: (request: CanvasCreateCompositeRequest) => CanvasCreateCompositeResult | null;
  /** Update a composable block binding or explicit JSON Pointer path. */
  updateBlock: (request: CanvasUpdateBlockRequest) => CanvasUpdateBlockResult | null;
  /** Extract structured content without preview runtime state. */
  extractStructuredContent: (
    request: CanvasExtractStructuredContentRequest,
  ) => CanvasExtractStructuredContentResult;
  /** Apply Agent-generated text, prompt, or structured content through shared target validation. */
  applyAgentContent: (payload: CanvasAgentContentPayload) => CanvasAgentApplyContentResult | null;
  /** Add or refresh durable production bindings on a narrative-scene node. */
  upsertNarrativeProductionBinding: (
    request: CanvasUpsertNarrativeProductionBindingRequest,
  ) => CanvasUpsertNarrativeProductionBindingResult | null;

  // ==================== Selection Actions ====================
  selectNode: (id: string, multi?: boolean) => void;
  selectConnection: (id: string, multi?: boolean) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  deleteSelected: () => void;

  // ==================== Media Playback ====================
  /** Set the currently playing media node (null to clear) */
  setActivePlayingNode: (nodeId: string | null) => void;

  // ==================== Inline Node Expansion ====================
  setExpandedNodeId: (nodeId: string | null) => void;
  toggleExpandedNode: (nodeId: string) => void;

  // ==================== History Actions ====================
  undo: () => void;
  redo: () => void;
}

export function canCreateCanvasConnection(
  nodes: readonly CanvasNode[],
  connection: Pick<CanvasConnection, 'sourceId' | 'targetId' | 'type'>,
  existingConnections: readonly CanvasConnection[] = [],
): boolean {
  const sourceNode = nodes.find((node) => node.id === connection.sourceId);
  const targetNode = nodes.find((node) => node.id === connection.targetId);
  if (!sourceNode || !targetNode) return false;
  if (createsDisallowedConnectionCycle(nodes, existingConnections, connection)) return false;
  if (!isRuntimeConnectionType(connection.type)) return true;

  if (isNarrativeStartNode(targetNode) && isNarrativeTraversalNode(sourceNode)) {
    return false;
  }

  if (isNarrativeEndingNode(sourceNode) && isNarrativeTraversalNode(targetNode)) {
    return false;
  }

  return true;
}

function isRuntimeConnectionType(type: CanvasConnection['type']): boolean {
  return type === undefined || type === 'default' || type === 'choice';
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeCanvasConnectionInput(
  connection: Omit<CanvasConnection, 'id'>,
  id: string,
): CanvasConnection {
  return {
    ...connection,
    id,
    sourceEndpoint: connection.sourceEndpoint ?? createNodeConnectionEndpoint(connection.sourceId),
    targetEndpoint: connection.targetEndpoint ?? createNodeConnectionEndpoint(connection.targetId),
  };
}

/** Record current state to history before a mutation */
function recordHistory(canvasData: CanvasData | null): void {
  if (!canvasData) return;
  useHistoryStore.getState().pushState(canvasData);
}

function recordCanvasDirty(description: string): void {
  useCanvasOperationStore.getState().recordDirty(description);
}

function arePositionsEqual(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
): boolean {
  return a?.x === b?.x && a?.y === b?.y;
}

function areSizesEqual(
  a: { width: number; height: number } | undefined,
  b: { width: number; height: number } | undefined,
): boolean {
  return a?.width === b?.width && a?.height === b?.height;
}

const SCENE_LAYOUT_PADDING_X = 24;
const SCENE_LAYOUT_PADDING_TOP = 64;
const SCENE_LAYOUT_GAP_X = 24;
const SCENE_LAYOUT_GAP_Y = 24;
const SCENE_LAYOUT_MIN_COLUMN_WIDTH = 220;

function getSceneOwnedShots(nodes: CanvasNode[], sceneId: string): ShotCanvasNode[] {
  return nodes.filter(isShotNode).filter((node) => getNodeParentId(node) === sceneId);
}

function sortShotsByCanvasOrder(shots: ShotCanvasNode[]): ShotCanvasNode[] {
  return [...shots].sort((a, b) => {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    return a.position.x - b.position.x;
  });
}

function getSceneShotOrder(scene: SceneGroupCanvasNode, nodes: CanvasNode[]): string[] {
  const ownedShots = getSceneOwnedShots(nodes, scene.id);
  const orderById = new Map(ownedShots.map((shot) => [shot.id, shot]));
  const explicitOrder = getContainerChildIds(scene).filter((shotId) => orderById.has(shotId));
  const remainingShots = ownedShots.filter((shot) => !explicitOrder.includes(shot.id));
  return [...explicitOrder, ...sortShotsByCanvasOrder(remainingShots).map((shot) => shot.id)];
}

function relinkSceneShotIds(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => {
    if (!isSceneGroupNode(node)) return node;
    const nextShotIds = getSceneShotOrder(node, nodes);
    return {
      ...node,
      container: {
        policy: 'scene',
        ...(node.container ?? {}),
        childIds: nextShotIds,
      },
    };
  });
}

function filterConnectionsTouchingNodeIds(
  connections: readonly CanvasConnection[],
  removedNodeIds: ReadonlySet<string>,
): CanvasConnection[] {
  return connections.filter(
    (conn) => !removedNodeIds.has(conn.sourceId) && !removedNodeIds.has(conn.targetId),
  );
}

function getNodeIdsRemovedByDeletePolicy(nodes: CanvasNode[], node: CanvasNode): Set<string> {
  if (!isContainerNode(node) || node.container?.deleteBehavior !== 'delete-subtree') {
    return new Set([node.id]);
  }

  return new Set([node.id, ...getContainerDescendantIds(nodes, node.id)]);
}

function deleteCanvasSelection(
  nodes: CanvasNode[],
  selectedNodeIds: ReadonlySet<string>,
): { readonly nodes: CanvasNode[]; readonly removedNodeIds: ReadonlySet<string> } {
  const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
  const removedNodeIds = new Set<string>();
  for (const node of selectedNodes) {
    for (const nodeId of getNodeIdsRemovedByDeletePolicy(nodes, node)) {
      removedNodeIds.add(nodeId);
    }
  }

  let nextNodes = nodes;
  for (const node of selectedNodes) {
    if (isContainerNode(node) && node.container?.deleteBehavior !== 'delete-subtree') {
      const result = releaseContainerChildren(nextNodes, node.id);
      if (!result.changed)
        throw new Error(result.error ?? `Could not release ${node.id} children.`);
      nextNodes = result.nodes;
    }
  }

  for (const node of selectedNodes) {
    const parentId = getNodeParentId(node);
    if (!parentId || removedNodeIds.has(parentId)) continue;
    const result = removeContainerChild(nextNodes, parentId, node.id);
    if (!result.changed) {
      throw new Error(result.error ?? `Could not remove ${node.id} from ${parentId}.`);
    }
    nextNodes = result.nodes;
  }

  return {
    nodes: relinkSceneShotIds(nextNodes.filter((node) => !removedNodeIds.has(node.id))),
    removedNodeIds,
  };
}

function layoutSceneShots(nodes: CanvasNode[], sceneId: string): CanvasNode[] {
  return autoArrangeContainer(relinkSceneShotIds(nodes), {
    containerId: sceneId,
    mode: 'sequence',
    paddingX: SCENE_LAYOUT_PADDING_X,
    paddingTop: SCENE_LAYOUT_PADDING_TOP,
    gapX: SCENE_LAYOUT_GAP_X,
    gapY: SCENE_LAYOUT_GAP_Y,
    minColumnWidth: SCENE_LAYOUT_MIN_COLUMN_WIDTH,
  });
}

function syncNodeContainerMembership(nodes: CanvasNode[], movedNodeId: string): CanvasNode[] {
  const movedNode = nodes.find((n) => n.id === movedNodeId);
  if (!movedNode) return nodes;
  const resolution = resolveCanvasDropContainer(nodes, movedNodeId, {
    movingSubtree: isContainerNode(movedNode),
  });
  if (resolution.diagnostic) throw new Error(resolution.diagnostic);
  const targetContainer = resolution.targetContainerId
    ? nodes.find((node) => node.id === resolution.targetContainerId)
    : undefined;

  let nextNodes = nodes;

  if (targetContainer) {
    const policyName = getContainerPolicyName(targetContainer);
    if (policyName === 'gallery') {
      nextNodes = addGalleryChild(nextNodes, targetContainer.id, movedNodeId).nodes;
    } else {
      nextNodes = addContainerChild(nextNodes, targetContainer.id, movedNodeId).nodes;
    }
    const cellSize = computeContainerChildSize(targetContainer);
    if (cellSize) {
      nextNodes = nextNodes.map((n) => (n.id === movedNodeId ? { ...n, size: cellSize } : n));
    }
    if (policyName === 'group') {
      nextNodes = expandSpatialGroupToIncludeChild(nextNodes, targetContainer.id, movedNodeId);
    }
  } else {
    const currentParentId = getNodeParentId(movedNode);
    if (currentParentId) {
      const parent = nodes.find((n) => n.id === currentParentId);
      const policyName = parent ? getContainerPolicyName(parent) : undefined;
      if (policyName === 'gallery') {
        nextNodes = removeGalleryChild(nextNodes, currentParentId, movedNodeId).nodes;
      } else {
        nextNodes = removeContainerChild(nextNodes, currentParentId, movedNodeId).nodes;
      }
      const defaultSize = NODE_DEFAULT_SIZES[movedNode.type];
      if (defaultSize) {
        nextNodes = nextNodes.map((n) => (n.id === movedNodeId ? { ...n, size: defaultSize } : n));
      }
    }
  }

  return relinkSceneShotIds(nextNodes);
}

function createNodeIndex(nodes: CanvasNode[]): Map<string, CanvasNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function recordChangedNodesForAudit(previousNodes: CanvasNode[], nextNodes: CanvasNode[]): void {
  const previousIndex = createNodeIndex(previousNodes);

  for (const nextNode of nextNodes) {
    const previousNode = previousIndex.get(nextNode.id);
    if (!previousNode) continue;

    const previousFingerprint = JSON.stringify({
      position: previousNode.position,
      data: previousNode.data,
    });
    const nextFingerprint = JSON.stringify({
      position: nextNode.position,
      data: nextNode.data,
    });

    if (previousFingerprint === nextFingerprint) continue;

    useCanvasOperationStore.getState().recordNodeUpdate(
      nextNode.id,
      {
        position: nextNode.position,
        data: nextNode.data,
      },
      {
        position: previousNode.position,
        data: previousNode.data,
      },
    );
  }
}

function withSubsystemMetadataDefaults(canvasData: CanvasData): CanvasData {
  return applyCanvasSubsystemMetadataDefaults({
    ...canvasData,
    nodes: clampNodeStoredSizes(canvasData.nodes),
  });
}

function clampNodeUpdateSize(node: CanvasNode, updates: Partial<CanvasNode>): Partial<CanvasNode> {
  if (!updates.size) {
    return updates;
  }

  return {
    ...updates,
    size: clampNodeSize(updates.size, resolveNodeMinSize(node)),
  };
}

// =============================================================================
// Store
// =============================================================================

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // ==================== Initial State ====================
  canvasData: null,
  selection: { nodeIds: [], connectionIds: [] },
  isConnecting: false,
  pendingConnectionSource: null,
  activePlayingNodeId: null,
  expandedNodeId: null,
  generationPanelState: { visible: false, nodeId: null, childNodeId: null },
  contentOverlayState: { visible: false, nodeId: null },

  openGenerationPanel: (nodeId, childNodeId, initialPrompt, opts) =>
    set({
      generationPanelState: {
        visible: true,
        nodeId,
        childNodeId: childNodeId ?? null,
        initialPrompt,
        initialControlMode: opts?.controlMode,
        initialGenerateVideo: opts?.generateVideo,
      },
    }),

  closeGenerationPanel: () =>
    set({ generationPanelState: { visible: false, nodeId: null, childNodeId: null } }),

  openContentOverlay: (nodeId) => set({ contentOverlayState: { visible: true, nodeId } }),

  closeContentOverlay: () => set({ contentOverlayState: { visible: false, nodeId: null } }),

  // ==================== Data Actions ====================
  setCanvasData: (data) => {
    set({ canvasData: withSubsystemMetadataDefaults(data) });
  },

  updateCanvasData: (updates, options) => {
    const { canvasData } = get();
    if (!canvasData) return;
    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        ...updates,
      }),
    });
    if (options?.dirty !== false) {
      recordCanvasDirty('Update canvas data');
    }
  },

  setPlaybackEntry: (nodeId) => {
    const { canvasData } = get();
    if (!canvasData || !canvasData.nodes.some((node) => node.id === nodeId)) return;
    if (
      canvasData.playback?.entryIds?.[0] === nodeId &&
      canvasData.playback.entryIds.length === 1
    ) {
      return;
    }

    recordHistory(canvasData);
    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        playback: {
          ...(canvasData.playback ?? { version: 1 }),
          version: 1,
          entryIds: [nodeId],
        },
      }),
    });
    recordCanvasDirty('Update canvas playback entry');
  },

  // ==================== Node Actions ====================
  addNode: (node) => {
    const { canvasData } = get();
    if (!canvasData) return '';

    recordHistory(canvasData);

    const id = generateId();
    const newNode = hydrateCanvasNodePreview(clampNodeStoredSize({ ...node, id } as CanvasNode));

    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        nodes: [...canvasData.nodes, newNode],
      }),
    });

    useCanvasOperationStore.getState().recordNodeAdd(newNode);
    return id;
  },

  addNodes: (nodes) => {
    const { canvasData } = get();
    if (!canvasData) return [];

    recordHistory(canvasData);

    const ids: string[] = [];
    const newNodes = nodes.map((node) => {
      const id = generateId();
      ids.push(id);
      return hydrateCanvasNodePreview(clampNodeStoredSize({ ...node, id } as CanvasNode));
    });

    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        nodes: [...canvasData.nodes, ...newNodes],
      }),
    });

    const ops = useCanvasOperationStore.getState();
    for (const node of newNodes) {
      ops.recordNodeAdd(node);
    }
    return ids;
  },

  updateNode: (id, updates) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    const before: Partial<CanvasNode> = {};
    if (oldNode) {
      for (const key of Object.keys(updates) as Array<keyof CanvasNode>) {
        (before as any)[key] = (oldNode as any)[key];
      }
    }
    const normalizedUpdates = oldNode ? clampNodeUpdateSize(oldNode, updates) : updates;

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? ({ ...node, ...normalizedUpdates } as CanvasNode) : node,
        ),
      },
    });

    useCanvasOperationStore.getState().recordNodeUpdate(id, normalizedUpdates, before);
  },

  updateNodeData: (id, data) => {
    const { canvasData } = get();
    if (!canvasData) return;

    recordHistory(canvasData);

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    const before: Partial<CanvasNode> = {};
    if (oldNode) {
      before.data = oldNode.data;
    }

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id
            ? refreshCanvasNodePreview({
                ...node,
                data: { ...node.data, ...data },
              } as CanvasNode)
            : node,
        ),
      },
    });

    useCanvasOperationStore
      .getState()
      .recordNodeUpdate(id, { data: { ...oldNode?.data, ...data } } as any, before);
  },

  removeNode: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

    const removedNode = canvasData.nodes.find((n) => n.id === id);
    if (!removedNode) return;
    recordHistory(canvasData);

    const removedNodeIds = getNodeIdsRemovedByDeletePolicy(canvasData.nodes, removedNode);
    const removedConnections = canvasData.connections.filter(
      (conn) => removedNodeIds.has(conn.sourceId) || removedNodeIds.has(conn.targetId),
    );

    const membershipNodes = removedNode.parentId
      ? removeContainerChild(canvasData.nodes, removedNode.parentId, id).nodes
      : canvasData.nodes;
    let nextNodes: CanvasNode[];
    if (removedNodeIds.size > 1) {
      nextNodes = deleteContainerSubtree(membershipNodes, id).nodes;
    } else if (isContainerNode(removedNode)) {
      nextNodes = releaseContainerChildren(membershipNodes, id).nodes.filter(
        (node) => node.id !== id,
      );
    } else {
      nextNodes = membershipNodes.filter((node) => node.id !== id);
    }

    const relinkedNodes = relinkSceneShotIds(nextNodes);

    set({
      canvasData: {
        ...canvasData,
        nodes: relinkedNodes,
        connections: filterConnectionsTouchingNodeIds(canvasData.connections, removedNodeIds),
      },
      selection: {
        ...selection,
        nodeIds: selection.nodeIds.filter((nodeId) => !removedNodeIds.has(nodeId)),
      },
    });

    useCanvasOperationStore.getState().recordNodeRemove(id, removedNode, removedConnections);
  },

  moveNodeEnd: (id, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    if (!oldNode || arePositionsEqual(oldNode.position, position)) return;
    recordHistory(canvasData);

    if (isContainerNode(oldNode)) {
      const dx = position.x - oldNode.position.x;
      const dy = position.y - oldNode.position.y;
      const translatedNodes = translateContainerSubtree(canvasData.nodes, id, { x: dx, y: dy });
      const nextNodes = syncNodeContainerMembership(translatedNodes, id);
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
    } else {
      const movedNodes = canvasData.nodes.map((node) =>
        node.id === id ? { ...node, position } : node,
      );
      const nextNodes = syncNodeContainerMembership(movedNodes, id);
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
    }

    useCanvasOperationStore
      .getState()
      .recordNodeUpdate(id, { position } as any, { position: oldNode.position } as any);
  },

  resizeNodeEnd: (id, size, position) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    if (!oldNode) return;
    const minimumSize = clampNodeSize(size, resolveNodeMinSize(oldNode));
    const spatialClamp =
      getContainerPolicyName(oldNode) === 'group'
        ? clampSpatialGroupResize(canvasData.nodes, id, minimumSize, position)
        : { size: minimumSize, position };
    if (
      areSizesEqual(oldNode.size, spatialClamp.size) &&
      arePositionsEqual(oldNode.position, spatialClamp.position)
    ) {
      return;
    }
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id
            ? { ...node, size: spatialClamp.size, position: spatialClamp.position }
            : node,
        ),
      },
    });

    useCanvasOperationStore
      .getState()
      .recordNodeUpdate(
        id,
        { size: spatialClamp.size, position: spatialClamp.position },
        { size: oldNode.size, position: oldNode.position },
      );
  },

  rotateNodeEnd: (id, rotation) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    if (!oldNode || (oldNode.rotation ?? 0) === rotation) return;
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, rotation } : node)),
      },
    });

    useCanvasOperationStore
      .getState()
      .recordNodeUpdate(id, { rotation } as any, { rotation: oldNode.rotation } as any);
  },

  assignShotsToScene: (sceneId, shotIds, autoLayout = true) => {
    const { canvasData } = get();
    if (!canvasData || shotIds.length === 0) return;

    const uniqueShotIds = [...new Set(shotIds)];
    const scene = canvasData.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!scene) return;

    recordHistory(canvasData);

    let relinkedNodes = canvasData.nodes;
    for (const shotId of uniqueShotIds) {
      relinkedNodes = addContainerChild(relinkedNodes, sceneId, shotId).nodes;
    }
    relinkedNodes = relinkSceneShotIds(relinkedNodes);

    const nextNodes = autoLayout ? layoutSceneShots(relinkedNodes, sceneId) : relinkedNodes;

    set({
      canvasData: {
        ...canvasData,
        nodes: nextNodes,
      },
    });

    recordChangedNodesForAudit(canvasData.nodes, nextNodes);
  },

  reorderSceneShots: (sceneId, shotIds, autoLayout = true) => {
    const { canvasData } = get();
    if (!canvasData || shotIds.length === 0) return;

    const scene = canvasData.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!scene) return;

    const dedupedShotIds = shotIds.filter((shotId, index) => shotIds.indexOf(shotId) === index);
    const ownedShots = getSceneOwnedShots(canvasData.nodes, sceneId).map((shot) => shot.id);
    if (
      dedupedShotIds.length !== ownedShots.length ||
      dedupedShotIds.some((shotId) => !ownedShots.includes(shotId))
    ) {
      return;
    }

    if (
      getContainerChildIds(scene).length === dedupedShotIds.length &&
      getContainerChildIds(scene).every((shotId, index) => shotId === dedupedShotIds[index])
    ) {
      return;
    }

    recordHistory(canvasData);

    const reorderResult = reorderContainerChildren(canvasData.nodes, sceneId, dedupedShotIds);
    const nextNodes = reorderResult.nodes;

    const resolvedNodes = autoLayout ? layoutSceneShots(nextNodes, sceneId) : nextNodes;

    set({
      canvasData: {
        ...canvasData,
        nodes: resolvedNodes,
      },
    });

    recordChangedNodesForAudit(canvasData.nodes, resolvedNodes);
  },

  autoLayoutSceneShots: (sceneId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const sceneExists = canvasData.nodes.some(
      (node) => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!sceneExists) return;

    recordHistory(canvasData);
    const nextNodes = layoutSceneShots(relinkSceneShotIds(canvasData.nodes), sceneId);

    set({
      canvasData: {
        ...canvasData,
        nodes: nextNodes,
      },
    });

    recordChangedNodesForAudit(canvasData.nodes, nextNodes);
  },

  detachShotFromScene: (sceneId, shotId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const scene = canvasData.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === sceneId,
    );
    if (!scene || !getContainerChildIds(scene).includes(shotId)) return;

    recordHistory(canvasData);

    const nextNodes = relinkSceneShotIds(
      removeContainerChild(canvasData.nodes, sceneId, shotId).nodes,
    );

    set({ canvasData: { ...canvasData, nodes: nextNodes } });
    recordChangedNodesForAudit(canvasData.nodes, nextNodes);
  },

  updateNodePorts: (id, ports) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, ports } : node)),
      },
    });

    if (oldNode) {
      useCanvasOperationStore
        .getState()
        .recordNodeUpdate(id, { ports } as any, { ports: oldNode.ports } as any);
    }
  },

  // ==================== Reorder Actions ====================
  reorderNode: (id, newZIndex) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const oldNode = canvasData.nodes.find((n) => n.id === id);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((node) =>
          node.id === id ? { ...node, zIndex: newZIndex } : node,
        ),
      },
    });

    if (oldNode) {
      useCanvasOperationStore.getState().recordNodeReorder(id, newZIndex, oldNode.zIndex);
    }
  },

  // ==================== Group Actions ====================
  groupNodes: (childIds) => {
    const { canvasData } = get();
    if (!canvasData || childIds.length === 0) return '';

    recordHistory(canvasData);

    // Calculate bounding box of children
    const children = canvasData.nodes.filter((n) => childIds.includes(n.id));
    if (children.length === 0) return '';

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + child.size.width);
      maxY = Math.max(maxY, child.position.y + child.size.height);
    }

    const padding = 20;
    const id = generateId();
    const maxZ = Math.max(...canvasData.nodes.map((n) => n.zIndex), 0);

    const groupNode = {
      id,
      type: 'group' as const,
      position: { x: minX - padding, y: minY - padding },
      size: { width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 },
      zIndex: maxZ + 1,
      locked: false,
      container: {
        policy: 'group' as const,
        childIds,
        deleteBehavior: 'release-children' as const,
      },
      data: {
        label: 'Group',
      },
    };

    const nextNodes = [...canvasData.nodes, groupNode as CanvasNode];
    let linkedNodes = nextNodes;
    for (const childId of childIds) {
      linkedNodes = addContainerChild(linkedNodes, id, childId).nodes;
    }

    set({
      canvasData: {
        ...canvasData,
        nodes: linkedNodes,
      },
      selection: { nodeIds: [id], connectionIds: [] },
    });

    useCanvasOperationStore.getState().recordNodeGroup(groupNode as CanvasNode, childIds);
    return id;
  },

  removeChildFromContainer: (containerId, childId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const container = canvasData.nodes.find((n) => n.id === containerId);
    if (!container) return;

    recordHistory(canvasData);

    const policyName = getContainerPolicyName(container);
    let nextNodes: CanvasNode[];
    let nextConnections = canvasData.connections;
    if (policyName === 'gallery') {
      const result = removeGalleryChild(canvasData.nodes, containerId, childId);
      nextNodes = result.nodes.filter((n) => n.id !== childId);
      nextConnections = canvasData.connections.filter(
        (connection) => connection.sourceId !== childId && connection.targetId !== childId,
      );
    } else {
      nextNodes = removeContainerChild(canvasData.nodes, containerId, childId).nodes;
    }

    set({
      canvasData: {
        ...canvasData,
        nodes: nextNodes,
        connections: nextConnections,
      },
    });
    recordCanvasDirty('Remove child from container');
  },

  ungroupNodes: (groupId) => {
    const { canvasData } = get();
    if (!canvasData) return;

    const groupNode = canvasData.nodes.find((n) => n.id === groupId);
    if (!groupNode || (groupNode.type as string) !== 'group') return;

    recordHistory(canvasData);

    const childIds = getContainerChildIds(groupNode);
    const releasedNodes = releaseContainerChildren(canvasData.nodes, groupId).nodes;

    set({
      canvasData: {
        ...canvasData,
        nodes: releasedNodes.filter((n) => n.id !== groupId),
        // Remove connections to/from the group node
        connections: canvasData.connections.filter(
          (c) => c.sourceId !== groupId && c.targetId !== groupId,
        ),
      },
      selection: { nodeIds: childIds, connectionIds: [] },
    });

    useCanvasOperationStore.getState().recordNodeUngroup(groupId, groupNode, childIds);
  },

  arrangeGroup: (groupId, sort) => {
    const { canvasData } = get();
    if (!canvasData) return;
    const nextNodes = arrangeSpatialGroup(canvasData.nodes, groupId, sort);
    if (nextNodes === canvasData.nodes) return;
    recordHistory(canvasData);
    set({ canvasData: { ...canvasData, nodes: nextNodes } });
    recordCanvasDirty('Arrange spatial Group');
  },

  fitGroupToContent: (groupId) => {
    const { canvasData } = get();
    if (!canvasData) return;
    const nextNodes = fitSpatialGroupToContent(canvasData.nodes, groupId);
    if (nextNodes === canvasData.nodes) return;
    recordHistory(canvasData);
    set({ canvasData: { ...canvasData, nodes: nextNodes } });
    recordCanvasDirty('Fit spatial Group to content');
  },

  setGroupCollapsed: (groupId, collapsed) => {
    const { canvasData } = get();
    if (!canvasData) return;
    const nextNodes = setSpatialGroupCollapsed(canvasData.nodes, groupId, collapsed);
    if (nextNodes === canvasData.nodes) return;
    recordHistory(canvasData);
    set({ canvasData: { ...canvasData, nodes: nextNodes } });
    recordCanvasDirty(collapsed ? 'Collapse spatial Group' : 'Expand spatial Group');
  },

  // ==================== Connection Actions ====================
  addConnection: (connection) => {
    const { canvasData } = get();
    if (!canvasData) return '';
    const hasSource = canvasData.nodes.some((node) => node.id === connection.sourceId);
    const hasTarget = canvasData.nodes.some((node) => node.id === connection.targetId);
    if (!hasSource || !hasTarget) {
      throw new Error('Connection source and target nodes must exist');
    }
    if (!canCreateCanvasConnection(canvasData.nodes, connection, canvasData.connections)) {
      throw new Error('Connection violates Canvas narrative graph constraints');
    }

    recordHistory(canvasData);

    const id = generateId();
    const newConnection: CanvasConnection = normalizeCanvasConnectionInput(connection, id);

    set({
      canvasData: {
        ...canvasData,
        connections: [...canvasData.connections, newConnection],
      },
    });

    useCanvasOperationStore.getState().recordConnectionAdd(newConnection);
    return id;
  },

  updateConnection: (id, updates) => {
    const { canvasData } = get();
    if (!canvasData) return;
    const oldConnection = canvasData.connections.find((conn) => conn.id === id);
    if (!oldConnection) return;
    const nextConnection = { ...oldConnection, ...updates };
    if (JSON.stringify(oldConnection) === JSON.stringify(nextConnection)) return;

    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        connections: canvasData.connections.map((conn) => (conn.id === id ? nextConnection : conn)),
      },
    });
    recordCanvasDirty('Update connection');
  },

  removeConnection: (id) => {
    const { canvasData, selection } = get();
    if (!canvasData) return;

    const removedConnection = canvasData.connections.find((c) => c.id === id);
    if (!removedConnection) return;
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        connections: canvasData.connections.filter((conn) => conn.id !== id),
      },
      selection: {
        ...selection,
        connectionIds: selection.connectionIds.filter((connId) => connId !== id),
      },
    });

    useCanvasOperationStore.getState().recordConnectionRemove(id, removedConnection);
  },

  startConnection: (nodeId, handleId) => {
    set({
      isConnecting: true,
      pendingConnectionSource: { nodeId, handleId },
    });
  },

  completeConnection: (nodeId, handleId) => {
    const { pendingConnectionSource, canvasData } = get();
    if (!pendingConnectionSource || !canvasData) {
      set({ isConnecting: false, pendingConnectionSource: null });
      return;
    }

    // Don't connect to self
    if (pendingConnectionSource.nodeId === nodeId) {
      set({ isConnecting: false, pendingConnectionSource: null });
      return;
    }

    const sourceNode = canvasData.nodes.find((n) => n.id === pendingConnectionSource.nodeId);
    const targetNode = canvasData.nodes.find((n) => n.id === nodeId);

    if (!sourceNode || !targetNode) {
      set({ isConnecting: false, pendingConnectionSource: null });
      return;
    }

    // Resolve ports for validation
    const sourcePorts = sourceNode.ports ?? getDefaultPorts(sourceNode.type);
    const targetPorts = targetNode.ports ?? getDefaultPorts(targetNode.type);
    const sourcePort = sourcePorts.find(
      (p: PortDefinition) => p.id === pendingConnectionSource.handleId,
    );
    const targetPort = targetPorts.find((p: PortDefinition) => p.id === handleId);

    // Port-based validation (when both nodes have ports)
    if (sourcePort && targetPort) {
      // Must connect output → input
      if (sourcePort.type !== 'output' || targetPort.type !== 'input') {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }

      // Check data type compatibility
      if (!arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }

      // Check max connections on target input port
      const maxConn = targetPort.maxConnections ?? 1;
      const existingCount = canvasData.connections.filter(
        (c) =>
          c.targetId === nodeId &&
          c.targetEndpoint.scope === 'port' &&
          c.targetEndpoint.portId === handleId,
      ).length;
      if (existingCount >= maxConn) {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }
    }

    // Check if exact connection already exists
    const exists = canvasData.connections.some(
      (conn) =>
        conn.sourceId === pendingConnectionSource.nodeId &&
        conn.targetId === nodeId &&
        conn.sourceEndpoint.scope === (sourcePort ? 'port' : 'node') &&
        conn.sourceEndpoint.portId ===
          (sourcePort ? pendingConnectionSource.handleId : undefined) &&
        conn.targetEndpoint.scope === (targetPort ? 'port' : 'node') &&
        conn.targetEndpoint.portId === (targetPort ? handleId : undefined),
    );

    if (!exists) {
      const connection: Omit<CanvasConnection, 'id'> = {
        sourceId: pendingConnectionSource.nodeId,
        targetId: nodeId,
        type: 'default',
        sourceEndpoint: sourcePort
          ? createPortConnectionEndpoint(
              pendingConnectionSource.nodeId,
              pendingConnectionSource.handleId,
            )
          : createNodeConnectionEndpoint(pendingConnectionSource.nodeId),
        targetEndpoint: targetPort
          ? createPortConnectionEndpoint(nodeId, handleId)
          : createNodeConnectionEndpoint(nodeId),
      };

      if (!canCreateCanvasConnection(canvasData.nodes, connection, canvasData.connections)) {
        set({ isConnecting: false, pendingConnectionSource: null });
        return;
      }

      get().addConnection(connection);
    }

    set({ isConnecting: false, pendingConnectionSource: null });
  },

  cancelConnection: () => {
    set({ isConnecting: false, pendingConnectionSource: null });
  },

  // ==================== Derive Actions ====================
  deriveSuccessorNode: (sourceNodeId, targetType?) => {
    const result = get().deriveNode({
      sourceNodeId,
      targetType: targetType as CanvasNode['type'] | undefined,
    });
    return result?.nodeId ?? null;
  },

  deriveNode: (request) => {
    const { canvasData } = get();
    if (!canvasData) return null;

    const mutation = deriveCanvasNode(
      {
        nodes: canvasData.nodes,
        connections: canvasData.connections,
        generateId,
      },
      request,
    );
    recordHistory(canvasData);

    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        nodes: mutation.nodes,
        connections: mutation.connections,
      }),
      selection: { nodeIds: [mutation.result.nodeId], connectionIds: [] },
    });

    useCanvasOperationStore.getState().recordNodeAdd(mutation.result.node as CanvasNode);
    if (mutation.result.connectionId) {
      const connection = mutation.connections.find(
        (item) => item.id === mutation.result.connectionId,
      );
      if (connection) {
        useCanvasOperationStore.getState().recordConnectionAdd(connection);
      }
    }

    return mutation.result;
  },

  createComposite: (request) => {
    const { canvasData } = get();
    if (!canvasData) return null;

    const mutation = createCanvasComposite(
      {
        nodes: canvasData.nodes,
        connections: canvasData.connections,
        generateId,
      },
      request,
    );
    recordHistory(canvasData);

    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        nodes: mutation.nodes,
        connections: mutation.connections,
      }),
      selection: { nodeIds: [mutation.result.containerId], connectionIds: [] },
    });

    const previousNodeIds = new Set(canvasData.nodes.map((node) => node.id));
    const addedNodes = mutation.nodes.filter((node) => !previousNodeIds.has(node.id));
    for (const node of addedNodes) {
      useCanvasOperationStore.getState().recordNodeAdd(node);
    }
    const previousConnectionIds = new Set(
      canvasData.connections.map((connection) => connection.id),
    );
    const addedConnections = mutation.connections.filter(
      (connection) => !previousConnectionIds.has(connection.id),
    );
    for (const connection of addedConnections) {
      useCanvasOperationStore.getState().recordConnectionAdd(connection);
    }

    return mutation.result;
  },

  updateBlock: (request) => {
    const { canvasData } = get();
    if (!canvasData) return null;

    const node = canvasData.nodes.find((candidate) => candidate.id === request.nodeId);
    if (!node) {
      throw new Error(`Node "${request.nodeId}" not found`);
    }

    const result = updateCanvasBlock(node, request);
    recordHistory(canvasData);

    set({
      canvasData: {
        ...canvasData,
        nodes: canvasData.nodes.map((candidate) =>
          candidate.id === request.nodeId ? refreshCanvasNodePreview(result.node) : candidate,
        ),
      },
    });

    useCanvasOperationStore
      .getState()
      .recordNodeUpdate(
        request.nodeId,
        { data: result.data } as Partial<CanvasNode>,
        { data: node.data } as Partial<CanvasNode>,
      );

    return {
      nodeId: result.nodeId,
      changed: result.changed,
      data: result.data,
    };
  },

  extractStructuredContent: (request) => {
    const { canvasData, selection } = get();
    const nodes = canvasData?.nodes ?? [];
    return extractStructuredCanvasContent(nodes, canvasData?.connections ?? [], {
      ...request,
      nodeIds:
        request.nodeIds ??
        (selection.nodeIds.length > 0 ? selection.nodeIds : nodes.map((node) => node.id)),
    });
  },

  applyAgentContent: (payload) => {
    const { canvasData } = get();
    if (!canvasData) return null;

    const mutation = applyCanvasAgentContent(
      {
        nodes: canvasData.nodes,
        connections: canvasData.connections,
        generateId,
      },
      payload,
    );
    recordHistory(canvasData);

    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        nodes: mutation.nodes,
        connections: mutation.connections,
      }),
      selection: mutation.result.nodeId
        ? { nodeIds: [mutation.result.nodeId], connectionIds: [] }
        : get().selection,
    });

    const previousNodeIds = new Set(canvasData.nodes.map((node) => node.id));
    const ops = useCanvasOperationStore.getState();
    for (const node of mutation.nodes) {
      if (!previousNodeIds.has(node.id)) {
        ops.recordNodeAdd(node);
      }
    }
    if (mutation.result.nodeId && previousNodeIds.has(mutation.result.nodeId)) {
      const before = canvasData.nodes.find((node) => node.id === mutation.result.nodeId);
      const after = mutation.nodes.find((node) => node.id === mutation.result.nodeId);
      if (before && after) {
        ops.recordNodeUpdate(
          mutation.result.nodeId,
          { data: after.data } as Partial<CanvasNode>,
          { data: before.data } as Partial<CanvasNode>,
        );
      }
    }

    return mutation.result;
  },

  upsertNarrativeProductionBinding: (request) => {
    const { canvasData } = get();
    if (!canvasData) return null;
    const mutation = upsertCanvasNarrativeProductionBinding(
      {
        nodes: canvasData.nodes,
        connections: canvasData.connections,
      },
      request,
    );
    if (!mutation.result.changed) {
      return mutation.result;
    }
    recordHistory(canvasData);
    set({
      canvasData: withSubsystemMetadataDefaults({
        ...canvasData,
        nodes: mutation.nodes,
        connections: mutation.connections,
      }),
    });
    const before = canvasData.nodes.find((node) => node.id === request.nodeId);
    const after = mutation.nodes.find((node) => node.id === request.nodeId);
    if (before && after) {
      useCanvasOperationStore
        .getState()
        .recordNodeUpdate(
          request.nodeId,
          { data: after.data } as Partial<CanvasNode>,
          { data: before.data } as Partial<CanvasNode>,
        );
    }
    return mutation.result;
  },

  // ==================== Selection Actions ====================
  selectNode: (id, multi = false) => {
    const { selection } = get();

    if (multi) {
      const isSelected = selection.nodeIds.includes(id);
      set({
        selection: {
          ...selection,
          nodeIds: isSelected
            ? selection.nodeIds.filter((nodeId) => nodeId !== id)
            : [...selection.nodeIds, id],
        },
      });
    } else {
      set({
        selection: { nodeIds: [id], connectionIds: [] },
        expandedNodeId: id,
      });
    }
  },

  selectConnection: (id, multi = false) => {
    const { selection } = get();

    if (multi) {
      const isSelected = selection.connectionIds.includes(id);
      set({
        selection: {
          ...selection,
          connectionIds: isSelected
            ? selection.connectionIds.filter((connId) => connId !== id)
            : [...selection.connectionIds, id],
        },
      });
    } else {
      set({
        selection: { nodeIds: [], connectionIds: [id] },
        expandedNodeId: null,
      });
    }
  },

  selectNodes: (ids) => {
    set({
      selection: { nodeIds: ids, connectionIds: [] },
      expandedNodeId: ids.length === 1 ? ids[0]! : null,
    });
  },

  clearSelection: () => {
    set({
      selection: { nodeIds: [], connectionIds: [] },
      expandedNodeId: null,
    });
  },

  deleteSelected: () => {
    const { selection, canvasData } = get();
    if (!canvasData) return;
    if (selection.nodeIds.length === 0 && selection.connectionIds.length === 0) return;

    recordHistory(canvasData);

    const deletion = deleteCanvasSelection(canvasData.nodes, new Set(selection.nodeIds));
    const connectionsToRemove = new Set(selection.connectionIds);

    set({
      canvasData: {
        ...canvasData,
        nodes: deletion.nodes,
        connections: canvasData.connections.filter(
          (conn) =>
            !connectionsToRemove.has(conn.id) &&
            !deletion.removedNodeIds.has(conn.sourceId) &&
            !deletion.removedNodeIds.has(conn.targetId),
        ),
      },
      selection: { nodeIds: [], connectionIds: [] },
      expandedNodeId: null,
    });
    recordCanvasDirty('Delete selection');
  },

  // ==================== Media Playback ====================
  setActivePlayingNode: (nodeId) => {
    set({ activePlayingNodeId: nodeId });
  },

  setExpandedNodeId: (nodeId) => {
    set({ expandedNodeId: nodeId });
  },

  toggleExpandedNode: (nodeId) => {
    const { expandedNodeId } = get();
    set({ expandedNodeId: expandedNodeId === nodeId ? null : nodeId });
  },

  // ==================== History Actions ====================
  undo: () => {
    const { canvasData } = get();
    if (!canvasData) return;

    const previousState = useHistoryStore.getState().undo(canvasData);
    if (previousState) {
      set({
        canvasData: previousState,
        selection: { nodeIds: [], connectionIds: [] },
      });
      recordCanvasDirty('Undo canvas edit');
    }
  },

  redo: () => {
    const { canvasData } = get();
    if (!canvasData) return;

    const nextState = useHistoryStore.getState().redo(canvasData);
    if (nextState) {
      set({
        canvasData: nextState,
        selection: { nodeIds: [], connectionIds: [] },
      });
      recordCanvasDirty('Redo canvas edit');
    }
  },
}));
