import {
  AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE,
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES,
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES,
} from '@neko/shared';

const CONTACT_SHEET_LABEL_HEIGHT = 40;
const CONTACT_SHEET_MARGIN = 8;

export type ProviderImageBatchLayout = 'overview' | 'detail';

export interface ProviderImageBatchSource {
  readonly assetId: string;
  readonly label?: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface ProviderImageBatchResult {
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/jpeg';
  readonly sourceIndexes: readonly number[];
}

export async function normalizeProviderImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }> {
  if (bytes.byteLength <= AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) {
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(bytes).metadata();
      if (
        (metadata.width ?? 0) <= AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE &&
        (metadata.height ?? 0) <= AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE
      ) {
        return { bytes, mimeType };
      }
    } catch {
      return { bytes, mimeType };
    }
  }
  const sharp = (await import('sharp')).default;
  const normalized = await sharp(bytes)
    .rotate()
    .resize({
      width: AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE,
      height: AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82 })
    .toBuffer();
  if (normalized.byteLength > AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Normalized provider image is ${normalized.byteLength} bytes; maximum is ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES}.`,
    );
  }
  return { bytes: normalized, mimeType: 'image/jpeg' };
}

export async function normalizeProviderImageDataUri(
  uri: string,
): Promise<{ readonly url: string; readonly mimeType: string }> {
  const inline = /^data:(image\/[^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(uri);
  if (!inline) {
    throw new Error('Inline image payload must be a base64 image data URI.');
  }
  const normalized = await normalizeProviderImage(Buffer.from(inline[2]!, 'base64'), inline[1]!);
  return {
    url: `data:${normalized.mimeType};base64,${Buffer.from(normalized.bytes).toString('base64')}`,
    mimeType: normalized.mimeType,
  };
}

export async function composeProviderImageBatches(
  sources: readonly ProviderImageBatchSource[],
  layout: ProviderImageBatchLayout,
): Promise<readonly ProviderImageBatchResult[]> {
  const groupSize = layout === 'overview' ? AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES : 4;
  const batches: ProviderImageBatchResult[] = [];
  for (let start = 0; start < sources.length; start += groupSize) {
    const group = sources.slice(start, start + groupSize);
    batches.push({
      bytes: await composeContactSheet(group),
      mimeType: 'image/jpeg',
      sourceIndexes: group.map((_, index) => start + index),
    });
  }
  return batches;
}

async function composeContactSheet(sources: readonly ProviderImageBatchSource[]): Promise<Buffer> {
  if (sources.length === 0) throw new Error('Cannot compose an empty contact sheet.');
  const sharp = (await import('sharp')).default;
  const columns = Math.ceil(Math.sqrt(sources.length));
  const rows = Math.ceil(sources.length / columns);
  const cellWidth = Math.floor(AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE / columns);
  const cellHeight = Math.floor(AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE / rows);
  const composites = await Promise.all(
    sources.map(async (source, index) => {
      const tileWidth = Math.max(1, cellWidth - CONTACT_SHEET_MARGIN * 2);
      const tileHeight = Math.max(
        1,
        cellHeight - CONTACT_SHEET_LABEL_HEIGHT - CONTACT_SHEET_MARGIN * 2,
      );
      const rendered = await sharp(source.bytes)
        .rotate()
        .resize({
          width: tileWidth,
          height: tileHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [
        {
          input: rendered.data,
          left: column * cellWidth + Math.floor((cellWidth - rendered.info.width) / 2),
          top:
            row * cellHeight +
            CONTACT_SHEET_LABEL_HEIGHT +
            Math.floor((cellHeight - CONTACT_SHEET_LABEL_HEIGHT - rendered.info.height) / 2),
        },
        {
          input: Buffer.from(createTileLabelSvg(cellWidth, index + 1, source)),
          left: column * cellWidth,
          top: row * cellHeight,
        },
      ];
    }),
  );
  const sheet = await sharp({
    create: {
      width: AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE,
      height: AGENT_IMAGE_TRANSPORT_MAX_LONG_EDGE,
      channels: 3,
      background: '#f3f3f3',
    },
  })
    .composite(composites.flat())
    .jpeg({ quality: 82 })
    .toBuffer();
  if (sheet.byteLength <= AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) return sheet;
  const reduced = await sharp(sheet).jpeg({ quality: 68 }).toBuffer();
  if (reduced.byteLength <= AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES) return reduced;
  throw new Error(
    `Contact sheet is ${reduced.byteLength} bytes; maximum is ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOAD_BYTES}.`,
  );
}

function createTileLabelSvg(
  width: number,
  tileNumber: number,
  source: ProviderImageBatchSource,
): string {
  const label = escapeSvgText(`${tileNumber}  ${source.label ?? source.assetId}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CONTACT_SHEET_LABEL_HEIGHT}"><rect width="100%" height="100%" fill="#111"/><text x="10" y="27" fill="#fff" font-family="sans-serif" font-size="20">${label}</text></svg>`;
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
