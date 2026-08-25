import type { DshAcpHostToolPort, DshAcpJsonValue } from '@neko/agent-contracts/dsh-acp';
import type { Context } from '@deepseek-ai/cordis';
import {
  AttachmentId,
  type ImageAttachmentLimits,
  type ImageAttachmentRef,
} from '@deepseek-ai/dsh-attachment';
import type {} from '@deepseek-ai/dsh-llm';
import { defineTool, type JsonValue, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import {
  CONTENT_IMAGE_DSH_TOOL_NAME,
  CONTENT_IMAGE_DSH_TOOL_OPERATION,
  CONTENT_IMAGE_DSH_TOOL_PARAMETERS,
  contentLocatorsEqual,
  decodeContentImageDshChunk,
  decodeContentImageDshToolSource,
  type ContentImageDshChunk,
  type ContentLocator,
} from '@neko/content-domain';
import {
  DOCUMENT_DSH_TOOL_NAME,
  DOCUMENT_DSH_TOOL_PARAMETERS,
  decodeDocumentDshToolArgs,
  documentDshJsonValue,
  probeImageMetadata,
} from '@neko/content-domain/document';
import sharp from 'sharp';

export const name = 'openneko-content-tools';
export const inject = ['opennekoHostTools', 'tools'];

declare module '@deepseek-ai/cordis' {
  interface Context {
    opennekoHostTools: DshAcpHostToolPort<ToolRunContext>;
  }
}

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: DOCUMENT_DSH_TOOL_NAME,
          description:
            'Read bounded text, structure, and image metadata from an OpenNeko document. All arguments are top-level: pass the exact selected ContentLocator in source and never create an input wrapper.',
          parameters: DOCUMENT_DSH_TOOL_PARAMETERS,
          output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          async execute(args, execution) {
            const decoded = decodeDocumentDshToolArgs(args);
            const response = await ctx.opennekoHostTools.execute(
              {
                tool: DOCUMENT_DSH_TOOL_NAME,
                operation: decoded.operation,
                input: documentDshJsonValue(decoded.input),
              },
              execution,
            );
            if (response.outcome === 'failure') {
              throw new Error(`${response.diagnostic.code}: ${response.diagnostic.message}`);
            }
            return toDshJsonValue(response.result);
          },
        }),
      ),
    'openneko-content-tools',
  );
  ctx.inject(['attachments'], (imageCtx) => {
    imageCtx.effect(
      () =>
        imageCtx.tools.register(
          defineTool({
            name: CONTENT_IMAGE_DSH_TOOL_NAME,
            description:
              'Read an image from an exact OpenNeko ContentLocator and return the image itself. Use this for document image locators returned by openneko.document; use read_image for ordinary filesystem paths. Requires the current model to accept image input.',
            parameters: CONTENT_IMAGE_DSH_TOOL_PARAMETERS,
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  source: { ...CONTENT_IMAGE_DSH_TOOL_PARAMETERS.source, required: true },
                  image: {
                    type: 'object',
                    additionalProperties: false,
                    required: true,
                    properties: {
                      attachmentId: { type: 'string', required: true },
                      mediaType: {
                        type: 'string',
                        enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
                        required: true,
                      },
                      bytes: { type: 'integer', required: true },
                      width: { type: 'integer', required: true },
                      height: { type: 'integer', required: true },
                      name: { type: 'string' },
                    },
                  },
                },
              },
              render: (_args, value) => {
                const ref = imageRef(value.image);
                return [
                  {
                    type: 'text',
                    text: `${ref.mediaType} image, ${ref.width}x${ref.height} px, ${ref.bytes} bytes`,
                  },
                  { type: 'image', attachment: ref },
                ];
              },
            },
            // One model-level call performs multiple ordered ACP Host reads. Keep calls
            // exclusive so a batch of images cannot exhaust the per-Session Host queue.
            isConcurrencySafe: () => false,
            async execute(args, execution) {
              const source = decodeContentImageDshToolSource(args.source);
              await assertImageCapableRoute(imageCtx, execution, source);
              const attachments = imageCtx.attachments;
              const loaded = await loadContentImage(source, execution, async (offset) => {
                const response = await imageCtx.opennekoHostTools.execute(
                  {
                    tool: CONTENT_IMAGE_DSH_TOOL_NAME,
                    operation: CONTENT_IMAGE_DSH_TOOL_OPERATION,
                    input: { source: contentImageJsonSource(source), offset },
                  },
                  execution,
                );
                if (response.outcome === 'failure') {
                  throw new Error(`${response.diagnostic.code}: ${response.diagnostic.message}`);
                }
                return decodeContentImageDshChunk(response.result);
              });
              const byteCap = Math.min(
                attachments.imageLimits.maxImageBytes,
                attachments.imageLimits.maxMessageImageBytes,
              );
              if (loaded.bytes.byteLength > byteCap) {
                throw new Error(
                  `Content image exceeds the active DSH attachment limit of ${byteCap} bytes.`,
                );
              }
              const attachmentImage = await prepareContentImageAttachment(
                loaded,
                attachments.imageLimits,
              );
              if (attachmentImage.bytes.byteLength > byteCap) {
                throw new Error(
                  `Content image payload exceeds the active DSH attachment limit of ${byteCap} bytes.`,
                );
              }
              const ref = await attachments.saveImage({
                data: attachmentImage.bytes,
                mediaType: attachmentImage.mimeType,
                name: contentImageName(source),
              });
              return {
                source,
                image: {
                  attachmentId: ref.attachmentId,
                  mediaType: ref.mediaType,
                  bytes: ref.bytes,
                  width: ref.width,
                  height: ref.height,
                  ...(ref.name === undefined ? {} : { name: ref.name }),
                },
              };
            },
          }),
        ),
      'openneko-content-image-tools',
    );
  });
}

async function prepareContentImageAttachment(
  image: {
    readonly bytes: Uint8Array;
    readonly mimeType: ContentImageDshChunk['mimeType'];
  },
  limits: ImageAttachmentLimits,
): Promise<{
  readonly bytes: Uint8Array;
  readonly mimeType: ContentImageDshChunk['mimeType'];
}> {
  const metadata = probeImageMetadata(image.bytes);
  if (metadata === null || metadata.mimeType !== image.mimeType) {
    throw new Error('Content image metadata does not match the transferred image.');
  }
  const sourceDimensions = requireRasterDimensions(metadata, 'Content image');
  const sourcePixels = sourceDimensions.width * sourceDimensions.height;
  if (!Number.isSafeInteger(sourcePixels) || sourcePixels > limits.maxImagePixels) {
    throw new Error(
      `Content image exceeds the active DSH decoded-size limit of ${limits.maxImagePixels} pixels.`,
    );
  }
  if (Math.max(sourceDimensions.width, sourceDimensions.height) <= limits.maxImageDimension) {
    return image;
  }

  const resized = await sharp(image.bytes, { limitInputPixels: limits.maxImagePixels })
    .rotate()
    .resize({
      width: limits.maxImageDimension,
      height: limits.maxImageDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();
  const bounded = new Uint8Array(resized);
  const boundedMetadata = probeImageMetadata(bounded);
  if (boundedMetadata === null || boundedMetadata.mimeType !== image.mimeType) {
    throw new Error('Content image payload exceeds the active DSH limits.');
  }
  const boundedDimensions = requireRasterDimensions(boundedMetadata, 'Content image payload');
  if (
    Math.max(boundedDimensions.width, boundedDimensions.height) > limits.maxImageDimension ||
    boundedDimensions.width * boundedDimensions.height > limits.maxImagePixels
  ) {
    throw new Error('Content image payload exceeds the active DSH limits.');
  }
  return { bytes: bounded, mimeType: image.mimeType };
}

function requireRasterDimensions(
  metadata: { readonly width?: number; readonly height?: number },
  label: string,
): { readonly width: number; readonly height: number } {
  const { width, height } = metadata;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`${label} has no valid raster dimensions.`);
  }
  return { width, height };
}

async function loadContentImage(
  source: ContentLocator,
  execution: ToolRunContext,
  readChunk: (offset: number) => Promise<ContentImageDshChunk>,
): Promise<{
  readonly bytes: Uint8Array;
  readonly mimeType: ContentImageDshChunk['mimeType'];
}> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let totalBytes: number | undefined;
  let mimeType: ContentImageDshChunk['mimeType'] | undefined;
  while (totalBytes === undefined || offset < totalBytes) {
    execution.signal.throwIfAborted();
    const chunk = await readChunk(offset);
    if (!contentLocatorsEqual(chunk.source, source)) {
      throw new Error('Content image Host returned a mismatched source locator.');
    }
    if (chunk.offset !== offset) {
      throw new Error(`Content image Host returned offset ${chunk.offset}; expected ${offset}.`);
    }
    if (totalBytes !== undefined && chunk.totalBytes !== totalBytes) {
      throw new Error('Content image changed while it was being transferred.');
    }
    if (mimeType !== undefined && chunk.mimeType !== mimeType) {
      throw new Error('Content image MIME type changed while it was being transferred.');
    }
    const bytes = decodeCanonicalBase64(chunk.data);
    if (bytes.byteLength === 0 || offset + bytes.byteLength > chunk.totalBytes) {
      throw new Error('Content image Host returned an invalid chunk length.');
    }
    totalBytes = chunk.totalBytes;
    mimeType = chunk.mimeType;
    chunks.push(bytes);
    offset += bytes.byteLength;
  }
  if (totalBytes === undefined || mimeType === undefined || offset !== totalBytes) {
    throw new Error('Content image transfer did not reach its exact byte length.');
  }
  return { bytes: concatBytes(chunks, totalBytes), mimeType };
}

async function assertImageCapableRoute(
  ctx: Context,
  execution: ToolRunContext,
  source: ContentLocator,
): Promise<void> {
  const routed = execution.agent?.session.requestHeader()?.config;
  const provider = routed?.provider ?? execution.agent?.options.provider;
  const model = routed?.model ?? execution.agent?.options.model;
  const llm = ctx.get('llm');
  if (provider === undefined || model === undefined || llm === undefined) {
    throw new Error(`Cannot read ${contentImageName(source)}: the current model route is unknown.`);
  }
  const active = await llm.resolveModelInfo(provider, model, execution.signal);
  if (active.inputModalities?.includes('image') !== true) {
    throw new Error(
      `Cannot read ${contentImageName(source)}: current Agent model "${model}" does not declare image input. Select an image-capable Agent model and retry.`,
    );
  }
}

function imageRef(value: {
  readonly attachmentId: string;
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly name?: string;
}): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(value.attachmentId),
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(value.name === undefined ? {} : { name: value.name }),
  };
}

function contentImageName(source: ContentLocator): string {
  const path = source.selector?.kind === 'entry' ? source.selector.path : source.file.path;
  return path.split('/').at(-1) ?? 'image';
}

function contentImageJsonSource(source: ContentLocator): DshAcpJsonValue {
  if (source.file.authority !== 'workspace') {
    throw new Error('Content image source must remain under Workspace authority.');
  }
  if (source.selector !== undefined && source.selector.kind !== 'entry') {
    throw new Error('Content image source selector must identify an entry.');
  }
  return {
    file: { authority: 'workspace', path: source.file.path },
    ...(source.selector === undefined
      ? {}
      : { selector: { kind: 'entry', path: source.selector.path } }),
  };
}

function decodeCanonicalBase64(value: string): Uint8Array {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== value) {
    throw new Error('Content image Host returned non-canonical base64.');
  }
  return new Uint8Array(bytes);
}

function concatBytes(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function toDshJsonValue(value: DshAcpJsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(toDshJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toDshJsonValue(item)]),
    );
  }
  return value;
}
