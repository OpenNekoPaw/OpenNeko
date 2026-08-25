import { validateContentLocator, type ContentLocator } from '@neko/content-domain';
import {
  deriveCanvasMaterialOrigin,
  isCanvasDurableMaterialContentLocator,
  isCanvasEntityRepresentationEvidence,
  isCanvasGenerationEvidence,
  isCanvasMaterialActionDescriptor,
  isSafeUnavailableCanvasMaterialLocator,
  type CanvasMaterialActionDescriptor,
  type CanvasEntityRepresentationEvidence,
  type CanvasGenerationEvidence,
  type CanvasMaterialMediaKind,
  type CanvasMaterialOrigin,
} from './types/canvas-material-contracts';
import { selectedCanvasGenerationOutput } from './types/canvas-generation-node';
import { type CanvasNode } from './types/canvas';

export interface CanvasMaterialActionTarget {
  readonly nodeId: string;
  readonly mediaKind: CanvasMaterialMediaKind;
  readonly origin: CanvasMaterialOrigin;
  readonly locator: ContentLocator;
  readonly generation?: CanvasGenerationEvidence;
  readonly entityRepresentation?: CanvasEntityRepresentationEvidence;
}

/**
 * Resolves a selection into canonical material identities.
 * Unsupported node types intentionally produce no material targets; malformed
 * or stale material identity fails visibly instead of falling back to paths.
 */
export function resolveCanvasMaterialActionTargets(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
): readonly CanvasMaterialActionTarget[] {
  if (selectedNodeIds.length === 0) {
    throw new Error('Canvas material actions require at least one selected node.');
  }
  if (new Set(selectedNodeIds).size !== selectedNodeIds.length) {
    throw new Error('Canvas material action selection contains duplicate node identities.');
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const targets: CanvasMaterialActionTarget[] = [];
  for (const nodeId of selectedNodeIds) {
    const node = nodesById.get(nodeId);
    if (!node) {
      throw new Error(`Canvas material action selection references unknown node "${nodeId}".`);
    }
    if (node.type === 'generation') {
      const output = selectedCanvasGenerationOutput(node.data);
      if (!output) return [];
      const locatorResult = validateContentLocator(output.locator);
      if (!locatorResult.ok) {
        throw new Error(
          `Canvas Generation node "${nodeId}" selected output requires a valid canonical ContentLocator.`,
        );
      }
      targets.push({
        nodeId,
        mediaKind: output.kind === 'prompt' ? 'document' : output.kind,
        origin: 'generated',
        locator: locatorResult.locator,
      });
      continue;
    }
    if (node.type !== 'media' && node.type !== 'file') {
      return [];
    }

    if (node.data.contentLocator === undefined) {
      return [];
    }
    const locatorResult = validateContentLocator(node.data.contentLocator);
    if (!locatorResult.ok || !isCanvasDurableMaterialContentLocator(locatorResult.locator)) {
      if (isSafeUnavailableCanvasMaterialLocator(node.data.contentLocator)) return [];
      throw new Error(
        `Canvas material node "${nodeId}" requires a valid canonical ContentLocator.`,
      );
    }
    const mediaKind =
      node.type === 'media' ? node.data.mediaType : (node.data.mediaKind ?? 'document');
    if (!mediaKind) {
      throw new Error(
        `Canvas Media node "${nodeId}" requires an explicit media type; file extensions are not capability identity.`,
      );
    }
    targets.push({
      nodeId,
      mediaKind,
      origin: deriveCanvasMaterialOrigin(
        locatorResult.locator,
        isCanvasGenerationEvidence(node.data.generation) ? node.data.generation : undefined,
      ),
      locator: locatorResult.locator,
      ...(isCanvasGenerationEvidence(node.data.generation)
        ? { generation: structuredClone(node.data.generation) }
        : {}),
      ...(isCanvasEntityRepresentationEvidence(node.data.entityRepresentation)
        ? { entityRepresentation: structuredClone(node.data.entityRepresentation) }
        : {}),
    });
  }
  return targets;
}

/**
 * Projects only descriptors contributed by currently available capability
 * owners. Canvas does not infer actions from extensions or implement owner
 * behavior.
 */
export function projectCanvasMaterialActionCatalog(input: {
  readonly descriptors: readonly CanvasMaterialActionDescriptor[];
  readonly targets: readonly CanvasMaterialActionTarget[];
}): readonly CanvasMaterialActionDescriptor[] {
  if (input.targets.length === 0) return [];

  const descriptorIds = new Set<string>();
  return input.descriptors.filter((descriptor) => {
    if (!isCanvasMaterialActionDescriptor(descriptor)) {
      throw new Error('Canvas material capability owner contributed an invalid action descriptor.');
    }
    if (descriptorIds.has(descriptor.id)) {
      throw new Error(`Duplicate Canvas material action descriptor "${descriptor.id}".`);
    }
    descriptorIds.add(descriptor.id);

    const count = input.targets.length;
    if (
      count < descriptor.selection.minimum ||
      (descriptor.selection.maximum !== undefined && count > descriptor.selection.maximum)
    ) {
      return false;
    }
    return input.targets.every(
      (target) =>
        descriptor.mediaKinds.includes(target.mediaKind) &&
        descriptor.origins.includes(target.origin),
    );
  });
}
