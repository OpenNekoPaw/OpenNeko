import { type ContentLocator } from '@neko/content-domain';
import {
  deriveCanvasMaterialOrigin,
  type CanvasEntityRepresentationEvidence,
  type CanvasGenerationEvidence,
  type CanvasMaterialMediaKind,
} from './types/canvas-material-contracts';
import { planCanvasNodeCreation } from './utils/canvasHeadlessAuthoring';
import { type CanvasData, type CanvasConnection } from './types/canvas';
import { resolveCanvasImageNodeSize, type CanvasImageDimensions } from './canvas-node-sizing';

const DERIVED_CANVAS_NODE_GAP = 40;

/**
 * Host-resolved, portable material ready for a Canvas commit.
 * Authorization, linking and copying must already be complete.
 */
export interface ResolvedCanvasMaterialDescriptor {
  readonly locator: ContentLocator;
  readonly title: string;
  readonly mediaKind: CanvasMaterialMediaKind;
  readonly position?: { readonly x: number; readonly y: number };
  readonly generation?: CanvasGenerationEvidence;
  readonly entity?: CanvasEntityRepresentationEvidence;
  readonly intrinsicDimensions?: CanvasImageDimensions;
}

export function projectResolvedCanvasMaterialToCanvas(input: {
  readonly canvas: CanvasData;
  readonly material: ResolvedCanvasMaterialDescriptor;
  readonly generateId?: () => string;
}): CanvasData {
  const { material } = input;
  deriveCanvasMaterialOrigin(material.locator, material.generation);

  const position = material.position ?? {
    x: 100 + (input.canvas.nodes.length % 4) * 40,
    y: 100 + Math.floor(input.canvas.nodes.length / 4) * 40,
  };
  const portablePath = portableMaterialPath(material.locator);
  if (extensionOf(portablePath) === '.nkc') {
    return planCanvasNodeCreation(
      { canvasData: input.canvas, ...(input.generateId ? { generateId: input.generateId } : {}) },
      {
        type: 'canvas-embed',
        position,
        data: {
          canvasPath: portablePath,
          canvasTitle: material.title,
          contentLocator: material.locator,
        },
      },
    ).canvasData;
  }

  if (isRenderableMediaKind(material.mediaKind)) {
    const imageSize =
      material.mediaKind === 'image'
        ? resolveCanvasImageNodeSize(material.intrinsicDimensions ?? material.generation?.summary)
        : undefined;
    return planCanvasNodeCreation(
      { canvasData: input.canvas, ...(input.generateId ? { generateId: input.generateId } : {}) },
      {
        type: 'media',
        position,
        ...(imageSize ? { size: imageSize } : {}),
        data: {
          assetPath: material.locator.selector ? '' : portablePath,
          contentLocator: material.locator,
          mediaType: material.mediaKind,
          title: material.title,
          ...(material.generation ? { generation: material.generation } : {}),
          ...(material.entity ? { entityRepresentation: material.entity } : {}),
        },
      },
    ).canvasData;
  }

  return planCanvasNodeCreation(
    { canvasData: input.canvas, ...(input.generateId ? { generateId: input.generateId } : {}) },
    {
      type: 'file',
      position,
      data: {
        path: portablePath,
        title: material.title,
        mediaKind: material.mediaKind,
        contentLocator: material.locator,
        ...(material.generation ? { generation: material.generation } : {}),
        ...(material.entity ? { entityRepresentation: material.entity } : {}),
      },
    },
  ).canvasData;
}

/**
 * Commits an owner-produced derivative as a new Canvas node and records source lineage.
 * Source nodes and their locators remain immutable.
 */
export function projectDerivedCanvasMaterialToCanvas(input: {
  readonly canvas: CanvasData;
  readonly material: ResolvedCanvasMaterialDescriptor;
  readonly sourceNodeIds: readonly string[];
  readonly generateId?: () => string;
}): CanvasData {
  if (
    input.sourceNodeIds.length === 0 ||
    new Set(input.sourceNodeIds).size !== input.sourceNodeIds.length
  ) {
    throw new Error('Canvas derived output requires unique source node identities.');
  }
  const existingNodesById = new Map(input.canvas.nodes.map((node) => [node.id, node]));
  const sourceNodes = input.sourceNodeIds.map((sourceNodeId) => {
    const sourceNode = existingNodesById.get(sourceNodeId);
    if (!sourceNodeId.trim() || !sourceNode) {
      throw new Error(`Canvas derived output source node "${sourceNodeId}" does not exist.`);
    }
    return sourceNode;
  });
  const existingNodeIds = new Set(existingNodesById.keys());
  const material = input.material.position
    ? input.material
    : {
        ...input.material,
        position: {
          x:
            Math.max(...sourceNodes.map((node) => node.position.x + node.size.width)) +
            DERIVED_CANVAS_NODE_GAP,
          y: Math.min(...sourceNodes.map((node) => node.position.y)),
        },
      };

  const projected = projectResolvedCanvasMaterialToCanvas({
    canvas: input.canvas,
    material,
    ...(input.generateId ? { generateId: input.generateId } : {}),
  });
  const outputs = projected.nodes.filter((node) => !existingNodeIds.has(node.id));
  if (outputs.length !== 1) {
    throw new Error('Canvas derived output must create exactly one new node.');
  }
  const output = outputs[0];
  if (!output) {
    throw new Error('Canvas derived output node was not created.');
  }
  const connections = [...projected.connections];
  for (const sourceNodeId of input.sourceNodeIds) {
    const connection = derivedFromConnection(sourceNodeId, output.id);
    if (connections.some((candidate) => candidate.id === connection.id)) {
      throw new Error(`Canvas derived output lineage identity "${connection.id}" is occupied.`);
    }
    connections.push(connection);
  }
  return { ...projected, connections };
}

/**
 * Replaces an Entity-backed node only after an explicit user operation.
 * The expected binding poisons stale refreshes, while node identity, layout
 * and existing graph connections remain stable.
 */
export function replaceCanvasEntityRepresentationOnCanvas(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly expectedEntity: CanvasEntityRepresentationEvidence;
  readonly material: ResolvedCanvasMaterialDescriptor & {
    readonly entity: CanvasEntityRepresentationEvidence;
  };
}): CanvasData {
  const nodeIndex = input.canvas.nodes.findIndex((node) => node.id === input.nodeId);
  const current = input.canvas.nodes[nodeIndex];
  if (!current || (current.type !== 'media' && current.type !== 'file')) {
    throw new Error(`Canvas Entity representation node "${input.nodeId}" is unavailable.`);
  }
  const currentEntity = current.data.entityRepresentation;
  if (!currentEntity || !sameEntityEvidence(currentEntity, input.expectedEntity)) {
    throw new Error('Canvas Entity representation refresh is stale.');
  }
  if (input.material.entity.entityId !== currentEntity.entityId) {
    throw new Error('Canvas Entity representation refresh cannot change stable Entity identity.');
  }
  if (
    deriveCanvasMaterialOrigin(input.material.locator, input.material.generation) !== 'referenced'
  ) {
    throw new Error(
      'Canvas Entity representation refresh requires a referenced representation locator.',
    );
  }
  if (input.material.generation) {
    throw new Error('Canvas Entity representation refresh must not attach Generation evidence.');
  }

  const projected = projectResolvedCanvasMaterialToCanvas({
    canvas: { ...input.canvas, nodes: [], connections: [] },
    material: { ...input.material, position: current.position },
    generateId: () => current.id,
  });
  const created = projected.nodes[0];
  if (
    projected.nodes.length !== 1 ||
    !created ||
    (created.type !== 'media' && created.type !== 'file')
  ) {
    throw new Error('Canvas Entity representation refresh produced an unsupported node.');
  }
  const replacement = {
    ...created,
    position: current.position,
    size: current.size,
    zIndex: current.zIndex,
    ...(current.rotation !== undefined ? { rotation: current.rotation } : {}),
    ...(current.locked !== undefined ? { locked: current.locked } : {}),
    ...(current.parentId !== undefined ? { parentId: current.parentId } : {}),
  };
  const nodes = [...input.canvas.nodes];
  nodes[nodeIndex] = replacement;
  return { ...input.canvas, nodes };
}

function derivedFromConnection(sourceId: string, targetId: string): CanvasConnection {
  return {
    id: `material-derived:${encodeURIComponent(sourceId)}:${encodeURIComponent(targetId)}`,
    sourceId,
    targetId,
    type: 'derived-from',
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
  };
}

function sameEntityEvidence(
  left: CanvasEntityRepresentationEvidence,
  right: CanvasEntityRepresentationEvidence,
): boolean {
  return (
    left.entityId === right.entityId &&
    left.bindingId === right.bindingId &&
    left.role === right.role
  );
}

export function portableMaterialPath(locator: ContentLocator): string {
  return locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path;
}

function isRenderableMediaKind(
  value: CanvasMaterialMediaKind,
): value is 'image' | 'video' | 'audio' {
  return value === 'image' || value === 'video' || value === 'audio';
}

function extensionOf(locatorPath: string): string {
  const name = locatorPath.slice(locatorPath.lastIndexOf('/') + 1);
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLocaleLowerCase();
}
