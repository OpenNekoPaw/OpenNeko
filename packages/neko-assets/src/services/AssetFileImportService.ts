import type { AssetEntity } from '@neko/shared';

export interface AssetFileImportLibrary {
  readonly importFile: (filePath: string) => Promise<{ readonly entity: AssetEntity }>;
  readonly flush: () => Promise<void>;
}

export interface AssetFileImportFileSystem {
  readonly assertReadable: (filePath: string) => Promise<void>;
}

export interface AssetFileImportServiceOptions {
  readonly library: AssetFileImportLibrary;
  readonly fs: AssetFileImportFileSystem;
  readonly didImport: () => void;
}

/** Fail-visible explicit import path for workspace, media-library, and retained generated sources. */
export class AssetFileImportService {
  constructor(private readonly options: AssetFileImportServiceOptions) {}

  async importFile(filePath: string): Promise<AssetEntity> {
    if (!filePath.trim()) {
      throw new Error('Asset import requires a file path.');
    }
    await this.options.fs.assertReadable(filePath);
    const result = await this.options.library.importFile(filePath);
    await this.options.library.flush();
    this.options.didImport();
    return result.entity;
  }
}
