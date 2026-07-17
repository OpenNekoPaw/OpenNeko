import type { AgentObservationModality, PerceptionEvidence } from './agent-observation';
import type { Tool, ToolResult } from './tool';

export type PerceptionToolCostTier = 'free' | 'cheap' | 'moderate' | 'expensive';

export interface PerceptionToolMetadata {
  readonly kind: 'perception';
  readonly modality: AgentObservationModality;
  readonly outputSchema: 'perception-evidence';
  readonly cost: PerceptionToolCostTier;
  readonly requiresGpu: boolean;
  readonly cacheable: boolean;
  readonly idempotent: boolean;
}

export interface PerceptionTool extends Tool {
  readonly kind: 'perception';
  readonly perception: PerceptionToolMetadata;
  readonly operation?: never;
}

export interface PerceptionEvidenceToolResult extends ToolResult {
  readonly success: true;
  readonly data: PerceptionEvidence;
}

export interface PerceptionToolFailureResult extends ToolResult {
  readonly success: false;
  readonly error: string;
}

export type PerceptionToolResult = PerceptionEvidenceToolResult | PerceptionToolFailureResult;

export function isPerceptionTool(tool: Tool): tool is PerceptionTool {
  const perception = (tool as { readonly perception?: unknown }).perception;
  const operation = (tool as { readonly operation?: unknown }).operation;
  if (tool.kind !== 'perception' || operation !== undefined) {
    return false;
  }
  if (typeof perception !== 'object' || perception === null || Array.isArray(perception)) {
    return false;
  }

  const candidate = perception as Record<string, unknown>;
  return candidate['kind'] === 'perception' && candidate['outputSchema'] === 'perception-evidence';
}

export function createPerceptionEvidenceToolResult(
  evidence: PerceptionEvidence,
): PerceptionEvidenceToolResult {
  return {
    success: true,
    data: evidence,
  };
}

export function isPerceptionEvidenceToolResult(
  result: ToolResult,
): result is PerceptionEvidenceToolResult {
  return result.success === true && isPerceptionEvidence(result.data);
}

function isPerceptionEvidence(value: unknown): value is PerceptionEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['source'] === 'string' &&
    typeof candidate['summary'] === 'string' &&
    typeof candidate['createdAt'] === 'number'
  );
}
