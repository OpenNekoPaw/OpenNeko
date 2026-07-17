import * as fs from 'fs/promises';
import * as path from 'path';
import type { ITempFileService } from '../contracts/ITempFileService';

export class DefaultTempFileService implements ITempFileService {
  constructor(private readonly tempRoot: string) {}

  createTempPath(prefix: string, extension: string = ''): string {
    const normalizedExtension =
      extension.length === 0 ? '' : extension.startsWith('.') ? extension : `.${extension}`;

    return path.join(
      this.tempRoot,
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}${normalizedExtension}`,
    );
  }

  async writeTempFile(prefix: string, extension: string, content: Uint8Array): Promise<string> {
    const filePath = this.createTempPath(prefix, extension);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async deleteTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      /* ignore */
    }
  }
}
