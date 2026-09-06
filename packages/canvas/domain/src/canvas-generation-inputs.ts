import {
  contentLocatorKey,
  validateContentLocator,
  type ContentLocator,
  type ContentReadService,
} from '@neko/content-domain';
import type { CanvasData, CanvasNode, GenerationCanvasNode } from './types/canvas';
import {
  selectedCanvasGenerationOutput,
  type CanvasGenerationKind,
} from './types/canvas-generation-node';

export type CanvasGenerationInputKind = 'text' | 'image' | 'audio' | 'video';

export type CanvasGenerationResolvedInput =
  | {
      readonly kind: 'text';
      readonly sourceNodeId: string;
      readonly text: string;
      readonly digest: string;
    }
  | {
      readonly kind: 'image' | 'audio' | 'video';
      readonly sourceNodeId?: string;
      readonly locator: ContentLocator;
    };

export interface CanvasGenerationInputResolutionPort {
  fingerprintText(text: string): string | Promise<string>;
  readText(locator: ContentLocator): Promise<{ readonly text: string; readonly digest: string }>;
  stat: ContentReadService['stat'];
}

export class CanvasGenerationInputError extends Error {
  constructor(
    readonly code:
      | 'generation-input-target-invalid'
      | 'generation-input-source-missing'
      | 'generation-input-output-unavailable'
      | 'generation-input-type-mismatch'
      | 'generation-input-locator-invalid'
      | 'generation-input-unavailable',
    message: string,
    readonly sourceNodeId?: string,
  ) {
    super(message);
    this.name = 'CanvasGenerationInputError';
  }
}

export async function resolveCanvasGenerationInputs(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly port: CanvasGenerationInputResolutionPort;
}): Promise<readonly CanvasGenerationResolvedInput[]> {
  const target = input.canvas.nodes.find((node) => node.id === input.nodeId);
  if (!target || target.type !== 'generation') {
    throw new CanvasGenerationInputError(
      'generation-input-target-invalid',
      `Canvas Generation target "${input.nodeId}" does not exist.`,
    );
  }
  const resolved: CanvasGenerationResolvedInput[] = [];
  for (const connection of input.canvas.connections.filter(
    (candidate) => candidate.targetId === target.id && candidate.type === 'reference',
  )) {
    const source = input.canvas.nodes.find((node) => node.id === connection.sourceId);
    if (!source) {
      throw new CanvasGenerationInputError(
        'generation-input-source-missing',
        `Canvas Generation input source "${connection.sourceId}" does not exist.`,
        connection.sourceId,
      );
    }
    const value = await resolveSource(source, input.port);
    assertCompatible(target.data.recipe.kind, value.kind, source.id);
    resolved.push(value);
  }
  const connectedLocatorKeys = new Set(
    resolved.flatMap((value) =>
      value.kind === 'image' || value.kind === 'audio' || value.kind === 'video'
        ? [contentLocatorKey(value.locator)]
        : [],
    ),
  );
  for (const material of target.data.inputMaterials ?? []) {
    const locatorKey = contentLocatorKey(material.locator);
    if (connectedLocatorKeys.has(locatorKey)) continue;
    const value = await resolveLocator(undefined, material.locator, material.mediaKind, input.port);
    assertCompatible(target.data.recipe.kind, value.kind, undefined);
    resolved.push(value);
    connectedLocatorKeys.add(locatorKey);
  }
  return resolved;
}

async function resolveSource(
  source: CanvasNode,
  port: CanvasGenerationInputResolutionPort,
): Promise<CanvasGenerationResolvedInput> {
  switch (source.type) {
    case 'markdown':
      return {
        kind: 'text',
        sourceNodeId: source.id,
        text: source.data.content,
        digest: await port.fingerprintText(source.data.content),
      };
    case 'generation':
      return resolveGenerationSource(source, port);
    case 'media': {
      const kind = source.data.mediaType;
      if (!kind) return typeMismatch(source.id, 'Media input has no explicit media type.');
      return resolveLocator(source.id, source.data.contentLocator, kind, port);
    }
    case 'file': {
      if (source.data.mediaKind === 'document') {
        const locator = requireLocator(source.id, source.data.contentLocator);
        await assertAvailable(source.id, locator, 'document', port);
        const text = await port.readText(locator);
        return { kind: 'text', sourceNodeId: source.id, ...text };
      }
      if (
        source.data.mediaKind === 'image' ||
        source.data.mediaKind === 'audio' ||
        source.data.mediaKind === 'video'
      ) {
        return resolveLocator(source.id, source.data.contentLocator, source.data.mediaKind, port);
      }
      return typeMismatch(source.id, 'File input has no supported explicit material kind.');
    }
    case 'group':
    case 'job':
    case 'canvas-embed':
      return typeMismatch(
        source.id,
        `Canvas node type "${source.type}" is not a Generation input.`,
      );
  }
}

async function resolveGenerationSource(
  source: GenerationCanvasNode,
  port: CanvasGenerationInputResolutionPort,
): Promise<CanvasGenerationResolvedInput> {
  const output = selectedCanvasGenerationOutput(source.data);
  if (!output) {
    throw new CanvasGenerationInputError(
      'generation-input-output-unavailable',
      `Upstream Generation Node "${source.id}" has no selected successful output.`,
      source.id,
    );
  }
  if (output.kind === 'prompt') {
    await assertAvailable(source.id, output.locator, 'document', port);
    const text = await port.readText(output.locator);
    return { kind: 'text', sourceNodeId: source.id, ...text };
  }
  return resolveLocator(source.id, output.locator, output.kind, port);
}

async function resolveLocator(
  sourceNodeId: string | undefined,
  value: unknown,
  kind: 'image' | 'audio' | 'video',
  port: CanvasGenerationInputResolutionPort,
): Promise<CanvasGenerationResolvedInput> {
  const locator = requireLocator(sourceNodeId, value);
  await assertAvailable(sourceNodeId, locator, kind, port);
  return { kind, ...(sourceNodeId ? { sourceNodeId } : {}), locator };
}

function requireLocator(sourceNodeId: string | undefined, value: unknown): ContentLocator {
  const validation = validateContentLocator(value);
  if (!validation.ok) {
    const source = sourceNodeId ? `node "${sourceNodeId}"` : 'embedded material';
    throw new CanvasGenerationInputError(
      'generation-input-locator-invalid',
      `Canvas Generation ${source} has no stable ContentLocator.`,
      sourceNodeId,
    );
  }
  return validation.locator;
}

async function assertAvailable(
  sourceNodeId: string | undefined,
  locator: ContentLocator,
  kind: 'image' | 'audio' | 'video' | 'document',
  port: CanvasGenerationInputResolutionPort,
): Promise<void> {
  const result = await port.stat(locator);
  if (result.status !== 'ready') {
    const source = sourceNodeId ? `node "${sourceNodeId}"` : 'embedded material';
    throw new CanvasGenerationInputError(
      'generation-input-unavailable',
      `Canvas Generation ${source} ${kind} input is unavailable: ${result.diagnostic.code}.`,
      sourceNodeId,
    );
  }
}

function assertCompatible(
  targetKind: CanvasGenerationKind,
  inputKind: CanvasGenerationInputKind,
  sourceNodeId: string | undefined,
): void {
  const accepted = ACCEPTED_INPUTS[targetKind];
  if (!accepted.includes(inputKind)) {
    const source = sourceNodeId ? `node "${sourceNodeId}"` : 'embedded material';
    throw new CanvasGenerationInputError(
      'generation-input-type-mismatch',
      `Canvas Generation ${targetKind} Recipe does not accept ${inputKind} input from ${source}.`,
      sourceNodeId,
    );
  }
}

function typeMismatch(sourceNodeId: string, message: string): never {
  throw new CanvasGenerationInputError('generation-input-type-mismatch', message, sourceNodeId);
}

const ACCEPTED_INPUTS: Readonly<
  Record<CanvasGenerationKind, readonly CanvasGenerationInputKind[]>
> = {
  prompt: ['text'],
  image: ['text', 'image'],
  audio: ['text', 'audio'],
  video: ['text', 'image', 'video'],
};
