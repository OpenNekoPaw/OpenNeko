import { open, stat } from 'node:fs/promises';
import { Reader } from '@zip.js/zip.js';

const DEFAULT_NODE_ARCHIVE_RANGE_MAX_BYTES = 64 * 1024 * 1024;

export class NodeArchiveFileReader extends Reader<string> {
  constructor(
    private readonly filePath: string,
    private readonly maxRangeBytes = DEFAULT_NODE_ARCHIVE_RANGE_MAX_BYTES,
  ) {
    super(filePath);
  }

  override async init(): Promise<void> {
    Reader.prototype.init?.call(this);
    const metadata = await stat(this.filePath);
    this.size = metadata.size;
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || index < 0 || length < 0) {
      throw new Error(`Invalid archive byte range: ${index}+${length}`);
    }
    const boundedLength = Math.min(length, this.size - index);
    if (boundedLength < 0 || boundedLength > this.maxRangeBytes) {
      throw new Error(`Archive byte range exceeds the ${this.maxRangeBytes}-byte limit.`);
    }
    const handle = await open(this.filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(boundedLength);
      const { bytesRead } = await handle.read(buffer, 0, boundedLength, index);
      // zip.js constructs DataView from array.buffer, so each chunk must start at offset zero.
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }
}
