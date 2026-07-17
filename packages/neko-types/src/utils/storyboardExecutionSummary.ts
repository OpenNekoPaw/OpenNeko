import type {
  CanvasNode,
  CanvasSceneExecutionSummary,
  CanvasShotExecutionSummary,
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
  CanvasBoardSummary,
  CanvasCreativeScope,
  CanvasRelatedBoardRef,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from '../types';
import { getContainerChildIds, getNodeParentId } from './canvasLayered';
import { isSceneGroupNode, isShotNode } from '../types/canvas';

export interface CreateCanvasStoryboardExecutionSummaryInput {
  readonly nodes: readonly CanvasNode[];
  readonly request?: CanvasStoryboardExecutionSummaryRequest;
  readonly canvasFileUri?: string;
  readonly boardSummary?: CanvasBoardSummary;
  readonly creativeScope?: CanvasCreativeScope;
  readonly relatedBoards?: readonly CanvasRelatedBoardRef[];
}

export function createCanvasStoryboardExecutionSummary(
  input: CreateCanvasStoryboardExecutionSummaryInput,
): CanvasStoryboardExecutionSummary {
  const request = input.request ?? {};
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const scenes = input.nodes
    .filter(isSceneGroupNode)
    .filter((scene) => sceneMatchesRequest(scene, request))
    .map((scene) => projectSceneSummary(scene, input.nodes, nodeById, input.canvasFileUri));

  return {
    sourceScriptUri: request.sourceScriptUri,
    canvasFileUri: input.canvasFileUri ?? request.canvasFileUri,
    ...(input.boardSummary ? { boardSummary: input.boardSummary } : {}),
    ...(input.creativeScope ? { creativeScope: input.creativeScope } : {}),
    ...(input.relatedBoards ? { relatedBoards: input.relatedBoards } : {}),
    status: scenes.length > 0 ? summarizeStoryboardStatus(scenes) : 'not-found',
    scenes,
  };
}

function sceneMatchesRequest(
  scene: SceneGroupCanvasNode,
  request: CanvasStoryboardExecutionSummaryRequest,
): boolean {
  if (request.sceneNodeId && scene.id !== request.sceneNodeId) {
    return false;
  }

  if (request.sceneId && scene.data.sceneId !== request.sceneId) {
    return false;
  }

  if (
    request.sourceScriptUri &&
    scene.data.sourceScriptUri &&
    scene.data.sourceScriptUri !== request.sourceScriptUri
  ) {
    return false;
  }

  if (
    request.sourceScriptUri &&
    !scene.data.sourceScriptUri &&
    !request.sceneId &&
    !request.sceneNodeId
  ) {
    return false;
  }

  return true;
}

function projectSceneSummary(
  scene: SceneGroupCanvasNode,
  nodes: readonly CanvasNode[],
  nodeById: ReadonlyMap<string, CanvasNode>,
  canvasFileUri: string | undefined,
): CanvasSceneExecutionSummary {
  const shots = collectSceneShots(scene, nodes, nodeById).map(projectShotSummary);
  const generatedShotCount = shots.filter((shot) => isGeneratedShot(shot)).length;
  const failedShotCount = shots.filter((shot) => isFailedShot(shot)).length;
  const selectedThumbnailRef = shots.find((shot) => shot.thumbnailRef)?.thumbnailRef;

  return {
    sourceScriptUri: scene.data.sourceScriptUri,
    sceneId: scene.data.sceneId,
    sceneNodeId: scene.id,
    canvasFileUri,
    shotCount: shots.length,
    generatedShotCount,
    failedShotCount,
    status: deriveSceneStatus(shots, generatedShotCount, failedShotCount),
    selectedThumbnailRef,
    shots,
  };
}

function collectSceneShots(
  scene: SceneGroupCanvasNode,
  nodes: readonly CanvasNode[],
  nodeById: ReadonlyMap<string, CanvasNode>,
): ShotCanvasNode[] {
  const ordered = getContainerChildIds(scene)
    .map((childId) => nodeById.get(childId))
    .filter((node): node is ShotCanvasNode => Boolean(node && isShotNode(node)));
  const orderedIds = new Set(ordered.map((shot) => shot.id));
  const fallback = nodes
    .filter(isShotNode)
    .filter((shot) => getNodeParentId(shot) === scene.id && !orderedIds.has(shot.id))
    .sort((left, right) => {
      if (left.position.y !== right.position.y) {
        return left.position.y - right.position.y;
      }
      return left.position.x - right.position.x;
    });

  return [...ordered, ...fallback];
}

function projectShotSummary(shot: ShotCanvasNode): CanvasShotExecutionSummary {
  const selectedCandidate = shot.data.generationHistory.find((candidate) => candidate.selected);
  const selectedAssetRef = sanitizeStableRef(
    shot.data.generatedAsset?.id ??
      selectedCandidate?.assetId ??
      shot.data.generatedAsset?.assetRef?.uri ??
      shot.data.generatedImage,
  );
  const thumbnailRef = sanitizeStableRef(
    selectedCandidate?.assetId ?? selectedCandidate?.dataUrl ?? selectedAssetRef,
  );
  const generatedVideoRef = sanitizeStableRef(
    shot.data.generatedVideoAsset?.id ??
      shot.data.generatedVideoAsset?.assetRef?.uri ??
      shot.data.generatedVideo,
  );

  return {
    shotId: shot.id,
    shotNumber: shot.data.shotNumber,
    duration: shot.data.duration,
    generationStatus: shot.data.generationStatus,
    selectedAssetRef,
    thumbnailRef,
    generatedVideoRef,
    lastImportedToTimelineAt: shot.data.lastImportedToTimelineAt,
    lastImportedToTimelineProject: shot.data.lastImportedToTimelineProject,
  };
}

function sanitizeStableRef(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    value.includes('engineToken=') ||
    value.includes('access_token=')
  ) {
    return undefined;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value)) {
    return undefined;
  }

  return value;
}

function isGeneratedShot(shot: CanvasShotExecutionSummary): boolean {
  return (
    shot.generationStatus === 'done' ||
    Boolean(shot.selectedAssetRef || shot.thumbnailRef || shot.generatedVideoRef)
  );
}

function isFailedShot(shot: CanvasShotExecutionSummary): boolean {
  return shot.generationStatus === 'error' || shot.generationStatus === 'failed';
}

function deriveSceneStatus(
  shots: readonly CanvasShotExecutionSummary[],
  generatedShotCount: number,
  failedShotCount: number,
): CanvasSceneExecutionSummary['status'] {
  if (shots.length === 0) {
    return 'not-started';
  }
  if (failedShotCount === shots.length) {
    return 'failed';
  }
  if (failedShotCount > 0) {
    return 'partial';
  }
  if (generatedShotCount === shots.length) {
    return 'done';
  }
  if (generatedShotCount > 0 || shots.some((shot) => shot.generationStatus === 'generating')) {
    return 'in-progress';
  }
  return 'not-started';
}

function summarizeStoryboardStatus(
  scenes: readonly CanvasSceneExecutionSummary[],
): CanvasStoryboardExecutionSummary['status'] {
  if (scenes.every((scene) => scene.status === 'done')) {
    return 'done';
  }
  if (scenes.every((scene) => scene.status === 'failed')) {
    return 'failed';
  }
  if (scenes.some((scene) => scene.status === 'partial' || scene.status === 'failed')) {
    return 'partial';
  }
  if (scenes.some((scene) => scene.status === 'in-progress')) {
    return 'in-progress';
  }
  return 'not-started';
}
