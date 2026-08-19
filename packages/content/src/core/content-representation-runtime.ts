import {
  isContentRepresentationHandle,
  type ContentRepresentationBytes,
  type ContentRepresentationGenerator,
  type ContentRepresentationHandle,
  type ContentRepresentationMetadata,
  type ContentRepresentationReadOptions,
  type ContentRepresentationRequest,
  type ContentRepresentationResult,
  type ContentRepresentationService,
} from '../contracts';

export interface ContentRepresentationRuntimeOptions {
  readonly generators: readonly ContentRepresentationGenerator[];
  readonly createHandleId: () => string;
}

interface RepresentationBinding {
  readonly bytes: Uint8Array;
  readonly metadata: ContentRepresentationMetadata;
}

export class ContentRepresentationRuntime implements ContentRepresentationService {
  private readonly bindings = new Map<string, RepresentationBinding>();

  constructor(private readonly options: ContentRepresentationRuntimeOptions) {}

  async getRepresentation(
    request: ContentRepresentationRequest,
  ): Promise<ContentRepresentationResult> {
    if (request.signal?.aborted) {
      return unavailableWithoutHandle('representation-cancelled', 'Representation was cancelled.');
    }
    const generators = this.options.generators.filter((candidate) =>
      candidate.kinds.includes(request.spec.kind),
    );
    if (generators.length === 0) {
      return unavailableWithoutHandle(
        'representation-unsupported',
        `No representation generator owns '${request.spec.kind}'.`,
      );
    }
    if (generators.length !== 1) {
      throw new Error(`Representation kind '${request.spec.kind}' has multiple generators.`);
    }
    const generator = generators[0];
    if (!generator) {
      throw new Error(`Representation kind '${request.spec.kind}' has no generator.`);
    }
    const generated = await generator.generate({
      source: request.source,
      spec: request.spec,
      ...(request.expectedSourceFingerprint
        ? { expectedSourceFingerprint: request.expectedSourceFingerprint }
        : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (request.signal?.aborted) {
      return unavailableWithoutHandle('representation-cancelled', 'Representation was cancelled.');
    }
    const id = this.options.createHandleId();
    if (!id.trim() || this.bindings.has(id)) {
      throw new Error('Representation runtime produced an invalid or duplicate handle identity.');
    }
    const handle: ContentRepresentationHandle = {
      kind: 'content-representation-handle',
      id,
    };
    this.bindings.set(id, { bytes: generated.bytes, metadata: generated.metadata });
    return { status: 'ready', handle, metadata: generated.metadata };
  }

  async readRepresentation(
    handle: ContentRepresentationHandle,
    options: ContentRepresentationReadOptions = {},
  ): Promise<ContentRepresentationBytes> {
    if (!isContentRepresentationHandle(handle)) {
      throw new Error('Representation handle is invalid.');
    }
    if (options.signal?.aborted) {
      return unavailable(handle, 'representation-cancelled', 'Representation read was cancelled.');
    }
    const binding = this.bindings.get(handle.id);
    if (!binding) {
      return unavailable(handle, 'representation-missing', 'Representation handle is unavailable.');
    }
    const offset = options.range?.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > binding.bytes.byteLength) {
      return unavailable(
        handle,
        'representation-range-invalid',
        'Representation range is invalid.',
      );
    }
    const length = options.range?.length ?? binding.bytes.byteLength - offset;
    if (!Number.isInteger(length) || length <= 0 || offset + length > binding.bytes.byteLength) {
      return unavailable(
        handle,
        'representation-range-invalid',
        'Representation range is invalid.',
      );
    }
    if (options.maxBytes !== undefined && length > options.maxBytes) {
      return unavailable(handle, 'representation-too-large', 'Representation exceeds maxBytes.');
    }
    return {
      status: 'ready',
      handle,
      bytes: binding.bytes.slice(offset, offset + length),
      offset,
      totalByteLength: binding.bytes.byteLength,
      metadata: binding.metadata,
    };
  }

  releaseRepresentation(handle: ContentRepresentationHandle): void {
    if (!isContentRepresentationHandle(handle)) {
      throw new Error('Representation handle is invalid.');
    }
    this.bindings.delete(handle.id);
  }
}

function unavailable(
  handle: ContentRepresentationHandle,
  code:
    | 'representation-cancelled'
    | 'representation-missing'
    | 'representation-range-invalid'
    | 'representation-too-large',
  message: string,
): ContentRepresentationBytes {
  return { status: 'unavailable', handle, diagnostic: { code, severity: 'error', message } };
}

function unavailableWithoutHandle(
  code: 'representation-cancelled' | 'representation-unsupported',
  message: string,
): ContentRepresentationResult {
  return { status: 'unavailable', diagnostic: { code, severity: 'error', message } };
}
