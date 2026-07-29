import type { CanvasConnection, CanvasNode } from '@neko/shared';

export type CanvasInteractionPhase = 'idle' | 'fast-viewport' | 'transforming';

export interface CanvasRenderRefreshPolicyConfig {
  readonly throttleNodeThreshold: number;
  readonly heavyContentNodeThreshold: number;
  readonly denseGraphConnectionRatio: number;
  readonly maxShellDurationMs: number;
}

export interface CanvasRenderRefreshPolicyInput {
  readonly nodes: readonly CanvasNode[];
  readonly connections: readonly CanvasConnection[];
  readonly phase: CanvasInteractionPhase;
  readonly config?: Partial<CanvasRenderRefreshPolicyConfig>;
}

export interface CanvasRenderRefreshDecision {
  readonly phase: CanvasInteractionPhase;
  readonly nodeCount: number;
  readonly connectionCount: number;
  readonly isLargeCanvas: boolean;
  readonly isVeryLargeCanvas: boolean;
  readonly isDenseGraph: boolean;
  readonly shouldThrottleViewportProjection: boolean;
  readonly shouldFreezeConnectionProjection: boolean;
  readonly shouldUseHeavyContentShell: boolean;
  readonly maxShellDurationMs: number;
}

const DEFAULT_RENDER_REFRESH_POLICY_CONFIG: CanvasRenderRefreshPolicyConfig = {
  throttleNodeThreshold: 100,
  heavyContentNodeThreshold: 500,
  denseGraphConnectionRatio: 2,
  maxShellDurationMs: 2000,
};

export function resolveCanvasRenderRefreshDecision(
  input: CanvasRenderRefreshPolicyInput,
): CanvasRenderRefreshDecision {
  const config = {
    ...DEFAULT_RENDER_REFRESH_POLICY_CONFIG,
    ...input.config,
  };
  const nodeCount = input.nodes.length;
  const connectionCount = input.connections.length;
  const isLargeCanvas = nodeCount > config.throttleNodeThreshold;
  const isVeryLargeCanvas = nodeCount > config.heavyContentNodeThreshold;
  const isDenseGraph =
    nodeCount > 0 && connectionCount / nodeCount >= config.denseGraphConnectionRatio;
  const isFastViewport = input.phase === 'fast-viewport';
  const isTransforming = input.phase === 'transforming';

  return {
    phase: input.phase,
    nodeCount,
    connectionCount,
    isLargeCanvas,
    isVeryLargeCanvas,
    isDenseGraph,
    shouldThrottleViewportProjection: isFastViewport && isLargeCanvas,
    shouldFreezeConnectionProjection: isTransforming && (isDenseGraph || isVeryLargeCanvas),
    shouldUseHeavyContentShell: (isFastViewport || isTransforming) && isVeryLargeCanvas,
    maxShellDurationMs: config.maxShellDurationMs,
  };
}
