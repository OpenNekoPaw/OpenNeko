import type { CanvasData, CanvasConnection, CanvasNode } from './canvas';
import type { QualityProjectRef } from './media-quality';
import type {
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasNodeCreateSpec,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
} from './canvas-agent-operations';
import type {
  CanvasAuthoringDiagnostic,
  CanvasAuthoringResultStatus,
} from './canvas-authoring-contracts';
import type { CanvasStoryboardPayload, CreatedCanvasStoryboard } from './storyboard-planner';

export const CANVAS_HEADLESS_AUTHORING_CONTRACT_VERSION = 1 as const;

export type CanvasHeadlessAuthoringContractVersion =
  typeof CANVAS_HEADLESS_AUTHORING_CONTRACT_VERSION;

export type CanvasHeadlessAuthoringTargetKind = 'active' | 'file' | 'new';

export interface CanvasHeadlessAuthoringTarget {
  readonly kind?: CanvasHeadlessAuthoringTargetKind;
  readonly documentUri?: string;
  readonly title?: string;
  readonly reveal?: boolean;
  readonly expectedRevision?: string;
}

export interface ResolvedCanvasHeadlessAuthoringTarget {
  readonly kind: CanvasHeadlessAuthoringTargetKind;
  readonly documentUri: string;
  readonly title?: string;
  readonly created: boolean;
  readonly reveal: boolean;
}

export interface CanvasHeadlessAuthoringCreatedNodeRef {
  readonly nodeId: string;
  readonly type: CanvasNode['type'];
  readonly preset?: string;
  readonly parentId?: string;
}

export interface CanvasHeadlessAuthoringCreatedConnectionRef {
  readonly connectionId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type?: CanvasConnection['type'];
}

export type CanvasHeadlessAuthoringOperation =
  | {
      readonly kind: 'canvas.update';
      readonly updates: Partial<
        Pick<CanvasData, 'name' | 'viewport' | 'creativeScope' | 'relatedBoards'>
      >;
    }
  | { readonly kind: 'node.create'; readonly node: CanvasNode }
  | { readonly kind: 'node.replace'; readonly node: CanvasNode }
  | { readonly kind: 'connection.create'; readonly connection: CanvasConnection };

export interface CanvasHeadlessAuthoringOperationBatch {
  readonly version: CanvasHeadlessAuthoringContractVersion;
  readonly operations: readonly CanvasHeadlessAuthoringOperation[];
  readonly createdNodes?: readonly CanvasHeadlessAuthoringCreatedNodeRef[];
  readonly createdConnections?: readonly CanvasHeadlessAuthoringCreatedConnectionRef[];
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
}

export interface CanvasHeadlessAuthoringResultBase {
  readonly version: CanvasHeadlessAuthoringContractVersion;
  readonly status: CanvasAuthoringResultStatus;
  readonly documentUri: string;
  readonly target: ResolvedCanvasHeadlessAuthoringTarget;
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
  readonly projectRef?: QualityProjectRef;
  readonly batch?: CanvasHeadlessAuthoringOperationBatch;
  readonly createdNodes?: readonly CanvasHeadlessAuthoringCreatedNodeRef[];
  readonly createdConnections?: readonly CanvasHeadlessAuthoringCreatedConnectionRef[];
}

export interface CanvasHeadlessApplyOperationsRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
  readonly operations: readonly CanvasHeadlessAuthoringOperation[];
}

export interface CanvasHeadlessApplyOperationsResult extends CanvasHeadlessAuthoringResultBase {
  readonly canvasData?: CanvasData;
}

export interface CanvasHeadlessCreateNodeRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
  readonly node: CanvasNodeCreateSpec;
}

export interface CanvasHeadlessCreateNodeResult extends CanvasHeadlessAuthoringResultBase {
  readonly nodeId?: string;
  readonly node?: CanvasNode;
}

export interface CanvasHeadlessCreateConnectionRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
  readonly connection: CanvasCreateConnectionRequest;
}

export interface CanvasHeadlessCreateConnectionResult extends CanvasHeadlessAuthoringResultBase {
  readonly connectionId?: string;
  readonly connection?: CanvasConnection;
  readonly createConnectionResult?: CanvasCreateConnectionResult;
}

export interface CanvasHeadlessUpdateBlockAuthoringRequest extends CanvasUpdateBlockRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
}

export interface CanvasHeadlessUpdateBlockAuthoringResult extends CanvasHeadlessAuthoringResultBase {
  readonly updateBlockResult?: CanvasUpdateBlockResult;
}

export interface CanvasHeadlessCreateCompositeAuthoringRequest extends CanvasCreateCompositeRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
}

export interface CanvasHeadlessCreateCompositeAuthoringResult extends CanvasHeadlessAuthoringResultBase {
  readonly createCompositeResult?: CanvasCreateCompositeResult;
}

export interface CanvasHeadlessApplyAgentContentAuthoringRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
  readonly payload: CanvasAgentContentPayload;
}

export interface CanvasHeadlessApplyAgentContentAuthoringResult extends CanvasHeadlessAuthoringResultBase {
  readonly applyAgentContentResult?: CanvasAgentApplyContentResult;
}

export interface CanvasHeadlessCreateStoryboardAuthoringRequest {
  readonly target?: CanvasHeadlessAuthoringTarget;
  readonly payload: CanvasStoryboardPayload;
  readonly startX?: number;
  readonly startY?: number;
  readonly workflowPlanId?: string;
}

export interface CanvasHeadlessCreateStoryboardAuthoringResult extends CanvasHeadlessAuthoringResultBase {
  readonly storyboard?: CreatedCanvasStoryboard;
}

export interface CanvasHeadlessAuthoringPlan<T> {
  readonly batch: CanvasHeadlessAuthoringOperationBatch;
  readonly canvasData: CanvasData;
  readonly result: T;
}

export interface CanvasHostAppliedDocumentMessage {
  readonly type: 'canvas.hostAppliedDocument';
  readonly documentUri: string;
  readonly data: CanvasData;
  readonly reason: 'headless-authoring';
}
