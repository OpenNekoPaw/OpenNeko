import type {
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasMarkdownCapabilityResult,
} from '@neko/shared';
import {
  isCanvasMarkdownCapabilityId,
  isCanvasMarkdownCapabilityInput,
  validateCanvasMarkdownCapabilityInput,
} from '@neko/shared';

export interface CanvasMarkdownCapabilityOperations {
  applyAgentContent(payload: CanvasAgentContentPayload): Promise<CanvasAgentApplyContentResult>;
}

export async function invokeCanvasMarkdownCapability(
  input: unknown,
  operations?: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const diagnostics = validateCanvasMarkdownCapabilityInput(input);
  if (!isCanvasMarkdownCapabilityInput(input)) {
    const capabilityId =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? Reflect.get(input, 'capabilityId')
        : undefined;
    if (isCanvasMarkdownCapabilityId(capabilityId)) {
      return {
        capabilityId,
        status: 'blocked',
        diagnostics,
      };
    }
    throw new Error(
      `Invalid Canvas Markdown capability input: ${diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
  if (!operations) {
    throw new Error(
      `Canvas Markdown capability "${input.capabilityId}" requires Canvas operations.`,
    );
  }

  const result = await operations.applyAgentContent({
    kind: 'text',
    text: input.markdown,
    title: input.title,
    format: 'markdown',
    target: input.target,
    provenance: input.provenance,
  });
  const nodeIds = uniqueStrings([
    ...(result.nodeId ? [result.nodeId] : []),
    ...(result.createdNodeIds ?? []),
  ]);
  return {
    capabilityId: input.capabilityId,
    status: result.changed ? (nodeIds.length > 0 ? 'created' : 'changed') : 'validated',
    resolvedKind: 'markdown-note',
    nodeIds,
    diagnostics: [],
    preview: {
      title: input.title,
      rowCount: countNonEmptyLines(input.markdown),
      resolvedKind: 'markdown-note',
    },
  };
}

function countNonEmptyLines(markdown: string): number {
  return markdown.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
