import type {
  NekoPluginKey,
  PluginTransferMediaType,
  PluginTransferTarget,
  PluginTransferTargetMode,
  PluginTransferTargetRef,
  PluginsAvailable,
} from '@neko-agent/types';
import type { AgentContextPayload } from '@neko/shared';

export interface AmbientCanvasNodeProjection {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
}

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
    id: 'cut',
    label: 'Timeline',
    accepts: ['image', 'video', 'audio'],
    requiresPlugin: 'cut',
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
      if (target.id !== 'cut') return false;
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
  return {
    nodeId: chip.id,
    type: readCanvasContextNodeType(chip.data) ?? '',
    summary: chip.summary,
  };
}

function readCanvasContextNodeType(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined;
  }
  const type = (data as { readonly type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

function isContainerNodeType(type: string): boolean {
  return (
    type === 'scene' ||
    type === 'group' ||
    type === 'artboard' ||
    type === 'gallery' ||
    type === 'storyboard' ||
    type === 'table' ||
    type === 'project'
  );
}
