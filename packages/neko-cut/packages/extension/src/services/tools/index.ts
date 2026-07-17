/**
 * Tool registry: maps tool names to handler instances via strategy pattern.
 */

export type { IToolHandler, ToolApplyResult } from './types';

import type { IToolHandler } from './types';
import { QueryHandler } from './queryHandler';
import { ElementHandler } from './elementHandler';
import { EffectTransitionHandler } from './effectTransitionHandler';
import { ShapeHandler } from './shapeHandler';
import { KeyframeHandler } from './keyframeHandler';
import { MaskHandler } from './maskHandler';
import { TrackAudioHandler } from './trackAudioHandler';

/**
 * Create a registry mapping each tool name to its handler.
 */
export function createToolRegistry(): Map<string, IToolHandler> {
  const handlers: IToolHandler[] = [
    new QueryHandler(),
    new ElementHandler(),
    new EffectTransitionHandler(),
    new ShapeHandler(),
    new KeyframeHandler(),
    new MaskHandler(),
    new TrackAudioHandler(),
  ];

  const registry = new Map<string, IToolHandler>();
  handlers.forEach((handler) => {
    handler.toolNames.forEach((name) => {
      registry.set(name, handler);
    });
  });

  return registry;
}
