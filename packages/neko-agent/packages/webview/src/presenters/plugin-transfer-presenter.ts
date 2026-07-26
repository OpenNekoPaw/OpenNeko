import type {
  NekoPluginKey,
  AmbientCanvasNode,
  PluginTransferMediaType,
  PluginTransferTarget,
  PluginTransferTargetMode,
  PluginTransferTargetRef,
  PluginsAvailable,
} from '@neko-agent/types';
import { isCanvasNodeType, type AgentContextPayload } from '@neko/shared';

export type AmbientCanvasNodeProjection = AmbientCanvasNode;

export interface PluginTransferTargetProjection {
  id: PluginTransferTarget;
  label: 'Canvas' | 'Timeline' | 'Explorer';
  accepts: readonly PluginTransferMediaType[];
  requiresPlugin: NekoPluginKey | null;
}

export interface PluginTransferMenuProjection {
  targets: PluginTransferTargetProjection[];
  showMenu: boolean;
}

const PLUGIN_TRANSFER_TARGETS: readonly PluginTransferTargetProjection[] = [
  {
    id: 'canvas',
    label: 'Canvas',
    accepts: ['image'],
    requiresPlugin: 'canvas',
  },
  {
    id: 'explorer',
    label: 'Explorer',
    accepts: ['image', 'video', 'audio', 'model'],
    requiresPlugin: null,
  },
];

export function projectPluginTransferMenu(input: {
  mediaType: PluginTransferMediaType;
  plugins: PluginsAvailable;
  structuredKind?: 'cutStoryboard';
}): PluginTransferMenuProjection {
  const targets = PLUGIN_TRANSFER_TARGETS.filter((target) => {
    if (input.structuredKind === 'cutStoryboard') {
      return false;
    } else if (!target.accepts.includes(input.mediaType)) {
      return false;
    }
    if (target.requiresPlugin && !input.plugins[target.requiresPlugin]) return false;
    return true;
  });

  return {
    targets,
    showMenu: targets.length > 0,
  };
}

export function projectCanvasContentTransferTarget(input: {
  readonly ambientNodes?: readonly AmbientCanvasNodeProjection[];
  readonly contextChips?: readonly AgentContextPayload[];
  readonly fallbackMode?: PluginTransferTargetMode;
}): PluginTransferTargetRef {
  const resolved = resolveSingleCanvasNode(input.ambientNodes, input.contextChips);
  if (!resolved) {
    return { plugin: 'canvas', mode: input.fallbackMode ?? 'insert' };
  }
  if (isContainerNodeType(resolved.type)) {
    return { plugin: 'canvas', containerId: resolved.nodeId, mode: 'create-child' };
  }
  return { plugin: 'canvas', nodeId: resolved.nodeId, mode: 'append' };
}

function resolveSingleCanvasNode(
  ambientNodes: readonly AmbientCanvasNodeProjection[] | undefined,
  contextChips: readonly AgentContextPayload[] | undefined,
): AmbientCanvasNodeProjection | null {
  if (ambientNodes?.length === 1) {
    return ambientNodes[0] ?? null;
  }

  const canvasChips = (contextChips ?? []).filter((chip) => chip.type === 'canvas-node');
  if (canvasChips.length !== 1) {
    return null;
  }
  const chip = canvasChips[0];
  if (!chip) {
    return null;
  }
  const nodeType = readCanvasContextNodeType(chip.data);
  if (!nodeType) {
    return null;
  }
  return {
    nodeId: chip.id,
    type: nodeType,
    summary: chip.summary,
  };
}

function readCanvasContextNodeType(data: unknown): AmbientCanvasNode['type'] | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined;
  }
  const type = (data as { readonly type?: unknown }).type;
  return isCanvasNodeType(type) ? type : undefined;
}

function isContainerNodeType(type: AmbientCanvasNode['type']): boolean {
  return type === 'group';
}
