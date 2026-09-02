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
  CONTENT_IMAGES_DSH_TOOL_NAME,
  CONTENT_IMAGES_DSH_TOOL_PARAMETERS,
  contentLocatorsEqual,
  decodeContentImageDshChunk,
  decodeContentImageDshToolInput,
  decodeContentImagesDshToolInput,
  type ContentImageDshChunk,
  type ContentImageDshDetail,
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
const CONTENT_IMAGE_OVERVIEW_MAX_DIMENSION = 768;
const CONTENT_IMAGES_OVERVIEW_MAX_DIMENSION = 1_536;
const CONTENT_IMAGES_OVERVIEW_GUTTER = 12;

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
              'Read an image from an exact OpenNeko ContentLocator and return the image itself. Use detail="overview" for initial visual screening and detail="original" only for selected images that need close inspection. Use this for document image locators returned by openneko_document; use read_image for ordinary filesystem paths. Requires the current model to accept image input.',
            parameters: CONTENT_IMAGE_DSH_TOOL_PARAMETERS,
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  source: { ...CONTENT_IMAGE_DSH_TOOL_PARAMETERS.source, required: true },
                  detail: {
                    type: 'string',
                    enum: ['overview', 'original'],
                    required: true,
                  },
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
              const { source, detail } = decodeContentImageDshToolInput(args);
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
                detail,
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
                detail,
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
    imageCtx.effect(
      () =>
        imageCtx.tools.register(
          defineTool({
            name: CONTENT_IMAGES_DSH_TOOL_NAME,
            description:
              'Compare 1–4 distinct OpenNeko document images as one low-resolution contact sheet. Pass exact ContentLocators in decision-relevant order. This Tool is only for overview screening; after choosing a page, use openneko_read_image with detail="original" for close inspection.',
            parameters: CONTENT_IMAGES_DSH_TOOL_PARAMETERS,
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  slots: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        label: { type: 'string', required: true },
                        source: {
                          ...CONTENT_IMAGE_DSH_TOOL_PARAMETERS.source,
                          required: true,
                        },
                      },
                    },
                  },
                  image: {
                    type: 'object',
                    additionalProperties: false,
                    required: true,
                    properties: {
                      attachmentId: { type: 'string', required: true },
                      mediaType: { type: 'string', const: 'image/jpeg', required: true },
                      bytes: { type: 'integer', required: true },
                      width: { type: 'integer', required: true },
                      height: { type: 'integer', required: true },
                      name: { type: 'string', required: true },
                    },
                  },
                },
              },
              render: (_args, value) => {
                const ref = imageRef(value.image);
                const mapping = value.slots
                  .map(
                    (slot) =>
                      `${slot.label}: ${JSON.stringify(contentImageJsonSource(slot.source))}`,
                  )
                  .join('\n');
                return [
                  { type: 'text', text: `Overview contact sheet slots:\n${mapping}` },
                  { type: 'image', attachment: ref },
                ];
              },
            },
            isConcurrencySafe: () => false,
            async execute(args, execution) {
              const { sources } = decodeContentImagesDshToolInput(args);
              await assertImageCapableRoute(imageCtx, execution, sources[0]!);
              const attachments = imageCtx.attachments;
              const byteCap = Math.min(
                attachments.imageLimits.maxImageBytes,
                attachments.imageLimits.maxMessageImageBytes,
              );
              const loaded = [];
              for (const [index, source] of sources.entries()) {
                try {
                  const image = await loadContentImage(source, execution, async (offset) => {
                    const response = await imageCtx.opennekoHostTools.execute(
                      {
                        tool: CONTENT_IMAGE_DSH_TOOL_NAME,
                        operation: CONTENT_IMAGE_DSH_TOOL_OPERATION,
                        input: { source: contentImageJsonSource(source), offset },
                      },
                      execution,
                    );
                    if (response.outcome === 'failure') {
                      throw new Error(
                        `${response.diagnostic.code}: ${response.diagnostic.message}`,
                      );
                    }
                    return decodeContentImageDshChunk(response.result);
                  });
                  if (image.bytes.byteLength > byteCap) {
                    throw new Error(
                      `source exceeds the active DSH attachment limit of ${byteCap} bytes`,
                    );
                  }
                  loaded.push(image);
                } catch (error) {
                  throw new Error(
                    `Content image overview slot ${overviewSlotLabel(index)} failed: ${errorMessage(error)}`,
                  );
                }
              }
              const contactSheet = await prepareContentImagesOverview(
                loaded,
                attachments.imageLimits,
              );
              if (contactSheet.bytes.byteLength > byteCap) {
                throw new Error(
                  `Content image overview exceeds the active DSH attachment limit of ${byteCap} bytes.`,
                );
              }
              const ref = await attachments.saveImage({
                data: contactSheet.bytes,
                mediaType: contactSheet.mimeType,
                name: 'openneko-image-overview.jpg',
              });
              return {
                slots: sources.map((source, index) => ({
                  label: overviewSlotLabel(index),
                  source,
                })),
                image: {
                  attachmentId: ref.attachmentId,
                  mediaType: contactSheet.mimeType,
                  bytes: ref.bytes,
                  width: ref.width,
                  height: ref.height,
                  name: ref.name ?? 'openneko-image-overview.jpg',
                },
              };
            },
          }),
        ),
      'openneko-content-images-overview-tool',
    );
  });
}

async function prepareContentImagesOverview(
  images: readonly {
    readonly bytes: Uint8Array;
    readonly mimeType: ContentImageDshChunk['mimeType'];
  }[],
  limits: ImageAttachmentLimits,
): Promise<{
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/jpeg';
}> {
  const maxDimension = Math.min(
    CONTENT_IMAGES_OVERVIEW_MAX_DIMENSION,
    limits.maxImageDimension,
    Math.floor(Math.sqrt(limits.maxImagePixels)),
  );
  if (maxDimension < 1) {
    throw new Error('Content image overview has no valid output dimensions.');
  }
  const columns = images.length === 1 ? 1 : 2;
  const rows = Math.ceil(images.length / columns);
  const width = maxDimension;
  const height = Math.max(1, Math.floor((maxDimension * rows) / columns));
  const cellWidth = Math.floor(width / columns);
  const cellHeight = Math.floor(height / rows);
  const gutter = Math.min(
    CONTENT_IMAGES_OVERVIEW_GUTTER,
    Math.floor(Math.min(cellWidth, cellHeight) / 10),
  );
  const composites: Array<{ readonly input: Buffer; readonly left: number; readonly top: number }> =
    [];

  for (const [index, image] of images.entries()) {
    const metadata = probeImageMetadata(image.bytes);
    if (metadata === null || metadata.mimeType !== image.mimeType) {
      throw new Error(
        `Content image overview slot ${overviewSlotLabel(index)} has invalid metadata.`,
      );
    }
    const dimensions = requireRasterDimensions(
      metadata,
      `Content image overview slot ${overviewSlotLabel(index)}`,
    );
    const pixels = dimensions.width * dimensions.height;
    if (!Number.isSafeInteger(pixels) || pixels > limits.maxImagePixels) {
      throw new Error(
        `Content image overview slot ${overviewSlotLabel(index)} exceeds the active DSH decoded-size limit.`,
      );
    }
    const prepared = await sharp(image.bytes, { limitInputPixels: limits.maxImagePixels })
      .rotate()
      .resize({
        width: Math.max(1, cellWidth - gutter * 2),
        height: Math.max(1, cellHeight - gutter * 2),
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cellWidth + Math.floor((cellWidth - prepared.info.width) / 2);
    const top = row * cellHeight + Math.floor((cellHeight - prepared.info.height) / 2);
    composites.push({ input: prepared.data, left, top });
    composites.push({
      input: Buffer.from(overviewSlotBadge(overviewSlotLabel(index))),
      left: column * cellWidth + gutter,
      top: row * cellHeight + gutter,
    });
  }

  const bytes = new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 22, g: 22, b: 22 },
      },
    })
      .composite(composites)
      .jpeg({ quality: 80, chromaSubsampling: '4:4:4' })
      .toBuffer(),
  );
  return { bytes, mimeType: 'image/jpeg' };
}

function overviewSlotBadge(label: string): string {
  return `<svg width="44" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#111" fill-opacity="0.88"/><text x="22" y="30" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="#fff">${label}</text></svg>`;
}

function overviewSlotLabel(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function prepareContentImageAttachment(
  image: {
    readonly bytes: Uint8Array;
    readonly mimeType: ContentImageDshChunk['mimeType'];
  },
  limits: ImageAttachmentLimits,
  detail: ContentImageDshDetail,
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
  const maxDimension =
    detail === 'overview'
      ? Math.min(CONTENT_IMAGE_OVERVIEW_MAX_DIMENSION, limits.maxImageDimension)
      : limits.maxImageDimension;
  if (Math.max(sourceDimensions.width, sourceDimensions.height) <= maxDimension) {
    return image;
  }

  const resized = await sharp(image.bytes, { limitInputPixels: limits.maxImagePixels })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
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
    Math.max(boundedDimensions.width, boundedDimensions.height) > maxDimension ||
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
