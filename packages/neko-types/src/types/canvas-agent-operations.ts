import type {
  BehaviorMetadata,
  CanvasConnection,
  CanvasNode,
  CanvasNodeType,
  EntityGraphMetadata,
  MemoryGraphMetadata,
  NarrativeMetadata,
} from './canvas';
import type {
  CanvasCreativeScope,
  CanvasRelatedBoardRef,
  CanvasBoardSummary,
} from './canvas-creative-scope';
import type { CanvasConnectionEndpoint, FieldBinding, JsonPointerPath } from './canvas-layered';
import type {
  CanvasNarrativeAgentDiagnostic,
  CanvasNarrativeNodeAgentSummary,
} from './canvas-narrative-agent';
import type {
  NarrativeProductionBinding,
  NarrativeProductionBindingDiagnostic,
} from './narrative-production-binding';
import type { CanvasSubsystemId } from './canvas-subsystem';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasNodeCreateSpec {
  type?: CanvasNodeType;
  preset?: string;
  position?: CanvasPoint;
  data?: Record<string, unknown>;
}

export interface CanvasDeriveNodeRequest {
  sourceNodeId: string;
  targetPreset?: string;
  targetType?: CanvasNodeType;
  data?: Record<string, unknown>;
  connect?: boolean;
}

export interface CanvasDeriveNodeResult {
  nodeId: string;
  connectionId?: string;
  node?: CanvasNode;
}

export interface CanvasCreateConnectionRequest {
  sourceId: string;
  targetId: string;
  sourceEndpoint?: CanvasConnectionEndpoint;
  targetEndpoint?: CanvasConnectionEndpoint;
  type?: CanvasConnection['type'];
  label?: string;
  priority?: number;
  extension?: CanvasConnection['extension'];
}

export interface CanvasCreateConnectionResult {
  connectionId: string;
  connection?: CanvasConnection;
}

export interface CanvasCompositeChildSpec extends CanvasNodeCreateSpec {
  id?: string;
}

export interface CanvasCompositeConnectionSpec {
  id?: string;
  sourceChildIndex: number;
  targetChildIndex: number;
  sourceEndpoint?: Omit<CanvasConnectionEndpoint, 'nodeId'>;
  targetEndpoint?: Omit<CanvasConnectionEndpoint, 'nodeId'>;
  type?: CanvasConnection['type'];
  label?: string;
  priority?: number;
  extension?: CanvasConnection['extension'];
}

export interface CanvasCreateCompositeRequest {
  /** Optional stable container id for idempotent Host-owned composite replay. */
  containerId?: string;
  containerPreset?: string;
  containerType?: CanvasNodeType;
  position?: CanvasPoint;
  data?: Record<string, unknown>;
  children: readonly CanvasCompositeChildSpec[];
  connections?: readonly CanvasCompositeConnectionSpec[];
  autoLayout?: boolean;
}

export interface CanvasCreateCompositeResult {
  containerId: string;
  childIds: string[];
  connectionIds?: string[];
  nodes?: CanvasNode[];
}

export interface CanvasUpdateBlockRequest {
  nodeId: string;
  blockId?: string;
  path?: JsonPointerPath;
  binding?: FieldBinding;
  value: unknown;
}

export interface CanvasUpdateBlockResult {
  nodeId: string;
  changed: boolean;
  data?: Record<string, unknown>;
}

export interface CanvasUpsertNarrativeProductionBindingRequest {
  nodeId: string;
  binding: NarrativeProductionBinding;
}

export interface CanvasUpsertNarrativeProductionBindingResult {
  nodeId: string;
  changed: boolean;
  productionRefs?: readonly NarrativeProductionBinding[];
  diagnostics?: readonly NarrativeProductionBindingDiagnostic[];
}

export type CanvasStructuredContentFormat = 'json' | 'markdown' | 'prompt';

export interface CanvasExtractStructuredContentRequest {
  nodeIds?: readonly string[];
  format: CanvasStructuredContentFormat;
  includeChildren?: boolean;
}

export interface CanvasStructuredNodeSummary {
  id: string;
  type: CanvasNodeType;
  preset?: string;
  title?: string;
  summary?: string;
  parentId?: string;
  childIds?: string[];
  data: Record<string, unknown>;
  bindings?: Array<{
    blockId: string;
    label?: string;
    path: JsonPointerPath;
    value: unknown;
  }>;
  preview?: {
    title?: string;
    subtitle?: string;
    role?: string;
    thumbnailVariantId?: string;
  };
  narrative?: CanvasNarrativeNodeAgentSummary;
}

export interface CanvasExtractStructuredContentResult {
  format: CanvasStructuredContentFormat;
  nodeIds: string[];
  nodes: CanvasStructuredNodeSummary[];
  content: string | CanvasStructuredNodeSummary[];
}

export type CanvasAgentContentKind = 'text' | 'prompt' | 'structured';

export type CanvasAgentContentFormat = 'plain' | 'markdown' | 'json' | 'prompt';

export type CanvasAgentMutationMode = 'insert' | 'append' | 'replace' | 'apply' | 'create-child';

export interface CanvasAgentInsertionPoint {
  x: number;
  y: number;
}

export interface CanvasAgentTargetRef {
  canvasId?: string;
  nodeId?: string;
  containerId?: string;
  slotId?: string;
  fieldPath?: JsonPointerPath;
  insertionPoint?: CanvasAgentInsertionPoint;
  mode?: CanvasAgentMutationMode;
}

export interface CanvasAgentProvenance {
  source?: 'agent' | 'webview' | 'tool' | 'user' | 'plugin';
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  label?: string;
}

export interface CanvasAgentContentPayload {
  kind: CanvasAgentContentKind;
  text?: string;
  prompt?: string;
  content?: unknown;
  title?: string;
  format?: CanvasAgentContentFormat;
  target?: CanvasAgentTargetRef;
  provenance?: CanvasAgentProvenance;
}

export interface CanvasAgentContainerSummary {
  id: string;
  type: CanvasNodeType;
  preset?: string;
  policy?: string;
  childIds: string[];
  acceptedChildTypes?: CanvasNodeType[];
  slots?: Array<{
    id: string;
    label?: string;
    childIds?: string[];
  }>;
}

export interface CanvasAgentNodeSummary {
  id: string;
  type: CanvasNodeType;
  preset?: string;
  title?: string;
  summary?: string;
  parentId?: string;
  childIds?: string[];
  targetableFields?: Array<{
    path: JsonPointerPath;
    label?: string;
    valueType?: string;
  }>;
}

export interface CanvasAgentActiveContextRequest {
  includeSelection?: boolean;
  includeFocusedContainer?: boolean;
  includeNodeDetails?: boolean;
  includeSubsystemMetadata?: boolean;
  includeBoardNavigation?: boolean;
}

export interface CanvasAgentSubsystemMetadataSummary {
  narrative?: Pick<NarrativeMetadata, 'entryNodeId' | 'variables'>;
  behavior?: Pick<BehaviorMetadata, 'rootNodeId' | 'blackboard'>;
  entityGraph?: Pick<EntityGraphMetadata, 'entityScope' | 'bindingSource'>;
  memoryGraph?: Pick<MemoryGraphMetadata, 'queryContext' | 'timeRange'>;
}

export interface CanvasAgentActiveContextResult {
  documentUri?: string;
  canvasId?: string;
  boardSummary?: CanvasBoardSummary;
  creativeScope?: CanvasCreativeScope;
  relatedBoards?: readonly CanvasRelatedBoardRef[];
  nodeTypeSummary?: Readonly<Record<string, number>>;
  activeSubsystems?: readonly CanvasSubsystemId[];
  selectedNodeIds: string[];
  selectedNodeTypes?: readonly CanvasNodeType[];
  selectedNodes: CanvasAgentNodeSummary[];
  connections?: CanvasConnection[];
  focusedContainer?: CanvasAgentContainerSummary;
  subsystemMetadata?: CanvasAgentSubsystemMetadataSummary;
  narrativeDiagnostics?: readonly CanvasNarrativeAgentDiagnostic[];
  insertionPoint?: CanvasAgentInsertionPoint;
  viewport?: {
    pan: CanvasPoint;
    zoom: number;
  };
}

export interface CanvasAgentApplyContentResult {
  changed: boolean;
  mode: CanvasAgentMutationMode;
  nodeId?: string;
  containerId?: string;
  createdNodeIds?: string[];
  target?: CanvasAgentTargetRef;
  reason?: string;
}
