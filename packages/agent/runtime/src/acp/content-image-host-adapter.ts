import { AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES } from '@neko/agent-contracts';
import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  CONTENT_IMAGE_DSH_CHUNK_BYTES,
  CONTENT_IMAGE_DSH_TOOL_NAME,
  decodeContentImageDshChunkRequest,
} from '@neko/content-domain';
import { probeImageMetadata } from '@neko/content-domain/document';
import type { AgentContentAccessRuntime } from '../runtime/capability/agent-content-access-runtime';

export class ContentImageDshHostAdapter {
  constructor(
    private readonly content:
      AgentContentAccessRuntime | (() => Promise<AgentContentAccessRuntime>),
  ) {}

  async execute(
    request: DshAcpDomainToolRequest,
    signal?: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    signal?.throwIfAborted();
    if (request.tool !== CONTENT_IMAGE_DSH_TOOL_NAME) {
      return failure(
        'CONTENT_IMAGE_DSH_TOOL_MISMATCH',
        `Expected ${CONTENT_IMAGE_DSH_TOOL_NAME}, received ${request.tool}.`,
      );
    }
    let decoded;
    try {
      decoded = decodeContentImageDshChunkRequest(request.operation, request.input);
    } catch (error) {
      return failure('CONTENT_IMAGE_DSH_TOOL_INVALID_INPUT', errorMessage(error));
    }
    try {
      const runtime = typeof this.content === 'function' ? await this.content() : this.content;
      const loaded = await runtime.loadContentAsset({
        locator: decoded.source,
        maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
        ...(signal ? { signal } : {}),
      });
      if (loaded.status !== 'ready' || loaded.bytes === undefined) {
        return failure(
          loaded.diagnostics[0]?.code ?? 'CONTENT_IMAGE_DSH_SOURCE_UNAVAILABLE',
          loaded.diagnostics[0]?.message ?? 'Content image bytes are unavailable.',
        );
      }
      const metadata = probeImageMetadata(loaded.bytes);
      const mimeType = requireSupportedMimeType(metadata?.mimeType);
      if (decoded.offset >= loaded.bytes.byteLength) {
        return failure(
          'CONTENT_IMAGE_DSH_OFFSET_INVALID',
          `Content image chunk offset ${decoded.offset} is outside ${loaded.bytes.byteLength} bytes.`,
        );
      }
      const bytes = loaded.bytes.slice(
        decoded.offset,
        Math.min(decoded.offset + CONTENT_IMAGE_DSH_CHUNK_BYTES, loaded.bytes.byteLength),
      );
      const result: DshAcpJsonValue = {
        source: decoded.source as unknown as DshAcpJsonValue,
        offset: decoded.offset,
        totalBytes: loaded.bytes.byteLength,
        mimeType,
        data: Buffer.from(bytes).toString('base64'),
      };
      return { outcome: 'success', result };
    } catch (error) {
      return failure(toDiagnostic(error), errorMessage(error));
    }
  }
}

function requireSupportedMimeType(
  value: string | undefined,
): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (
    value === 'image/png' ||
    value === 'image/jpeg' ||
    value === 'image/webp' ||
    value === 'image/gif'
  ) {
    return value;
  }
  throw Object.assign(new Error('Content source is not a supported raster image.'), {
    code: 'CONTENT_IMAGE_DSH_FORMAT_UNSUPPORTED',
  });
}

function toDiagnostic(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof Reflect.get(error, 'code') === 'string'
  ) {
    return Reflect.get(error, 'code') as string;
  }
  return 'CONTENT_IMAGE_DSH_TOOL_FAILED';
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
