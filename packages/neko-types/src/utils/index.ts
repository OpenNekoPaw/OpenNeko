/**
 * Shared Utilities Index
 *
 * Re-exports all utility functions for convenient imports.
 */

// Color correction mapping (UI ↔ Engine)
export { mapBasicColorToEngine, mapEngineColorToBasic } from './colorCorrectionMapping';

// Media utilities (type detection, MIME mapping)
export {
  getFileExtension,
  detectMediaType,
  getMimeType,
  isMediaFile,
  isDocumentFile,
  isImageSequence,
  isSubtitleFile,
  getExtensionsForType,
} from './media';

// Diff utilities (LCS-based line diff, zero dependencies)
export {
  computeDiff,
  computeDiffStats,
  type DiffLine,
  type DiffLineType,
  type DiffStats,
} from './diff';

export {
  applyCanvasTimelineSyncToCanvas,
  buildStoryboardImportTimelineSyncPayload,
} from './canvasTimelineSync';
export {
  extractCanvasNodeGenerationLineage,
  projectCanvasShotPrompt,
  projectShotDataPrompt,
  type CanvasGenerationLineage,
  type CanvasShotPromptProjectableData,
  type CanvasShotPromptProjection,
} from './canvasGeneration';
export {
  buildEntityAssetRequirementsFromGeneratedMediaLineage,
  buildVisualIdentityDraftsFromGeneratedMediaLineage,
  type BuildEntityAssetRequirementsFromGeneratedMediaInput,
  type BuildVisualIdentityDraftsFromGeneratedMediaInput,
} from './creativeEntityLineage';
export {
  getContainerChildIds,
  getContainerChildReferences,
  getContainerPolicyName,
  getNodeParentId,
  getNodeParentReferences,
  isContainerNode,
  type CanvasContainerChildReference,
  type CanvasContainerChildSource,
  type CanvasParentReference,
  type CanvasParentReferenceSource,
} from './canvasLayered';
export {
  createNodeConnectionEndpoint,
  createPortConnectionEndpoint,
  findCanvasNodePort,
  getDefaultNodeEndpointSide,
  resolveCanvasConnectionEndpoint,
  type CanvasConnectionEndpointResolution,
} from './canvasConnection';
export {
  isJsonPointerPath,
  parseJsonPointer,
  readFieldBinding,
  readJsonPointer,
  writeFieldBinding,
  writeJsonPointer,
  type FieldBindingReadResult,
  type FieldBindingWriteResult,
} from './fieldBinding';
export {
  createStoryboardPayload,
  projectCanonicalStoryboardToCanvasPayload,
  applyStoryboardPayloadToCanvas,
} from './storyboardPlanner';
export {
  applyCanvasHeadlessAuthoringOperations,
  assertNoRuntimeResourceIdentity,
  createCanvasAuthoringDiagnostic,
  createCanvasAuthoringStableId,
  createCanvasHeadlessAuthoringIdFactory,
  createEmptyCanvasData,
  planCanvasAgentContentApplication,
  planCanvasBlockUpdate,
  planCanvasCompositeCreation,
  planCanvasConnectionCreation,
  planCanvasNodeCreation,
  planCanvasStoryboardSceneShotCreation,
  validateCanvasDurableResourceIdentity,
  type CanvasDurableResourceIdentityValidationOptions,
  type CanvasHeadlessAuthoringIdFactoryOptions,
  type CanvasHeadlessAuthoringPlannerContext,
} from './canvasHeadlessAuthoring';
export {
  CANVAS_WORKSPACE_INBOX_NODE_ID,
  planCanvasWorkspaceBoardProjection,
  type CanvasWorkspaceBoardProjectionPlan,
} from './canvasWorkspaceBoardProjection';
export {
  createCanvasStoryboardExecutionSummary,
  type CreateCanvasStoryboardExecutionSummaryInput,
} from './storyboardExecutionSummary';
