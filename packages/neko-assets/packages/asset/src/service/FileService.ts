/**
 * File Service
 *
 * Handles operations for asset files within variants.
 */

import type { AssetFile, AddFileOptions, MediaFileMetadata } from '@neko/shared';
import { detectMediaType, getMimeType } from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import { generateFileId } from './utils';

/**
 * Metadata extractor function type
 */
export type MetadataExtractor = (filePath: string) => Promise<MediaFileMetadata>;

/**
 * File service configuration
 */
export interface FileServiceConfig {
  /** Function to extract metadata from files */
  metadataExtractor?: MetadataExtractor;
}

/**
 * File service for managing asset files
 */
export class FileService {
  private metadataExtractor?: MetadataExtractor;

  constructor(
    private storage: IAssetStorage,
    config?: FileServiceConfig,
  ) {
    this.metadataExtractor = config?.metadataExtractor;
  }

  /**
   * Add a file to a variant
   */
  async add(variantId: string, filePath: string, options?: AddFileOptions): Promise<AssetFile> {
    // Detect media type from extension
    const mediaType = detectMediaType(filePath);

    // Extract or use provided metadata
    let metadata: MediaFileMetadata;
    if (options?.metadata) {
      metadata = {
        fileSize: options.metadata.fileSize ?? 0,
        mimeType: options.metadata.mimeType ?? getMimeType(filePath),
        ...options.metadata,
      };
    } else if (this.metadataExtractor) {
      metadata = await this.metadataExtractor(filePath);
    } else {
      // Minimal metadata
      metadata = {
        fileSize: 0,
        mimeType: getMimeType(filePath),
      };
    }

    const file: AssetFile = {
      id: generateFileId(),
      variantId,
      name: options?.name ?? this.extractFileName(filePath),
      path: filePath,
      mediaType,
      metadata,
      purpose: options?.purpose ?? 'main',
      createdAt: Date.now(),
      status: 'online',
      lastCheckedAt: Date.now(),
      ...(options?.characterAsset ? { characterAsset: options.characterAsset } : {}),
    };

    await this.storage.saveFile(variantId, file);
    return file;
  }

  /**
   * Get a file by ID
   */
  async get(variantId: string, fileId: string): Promise<AssetFile | null> {
    return this.storage.getFile(variantId, fileId);
  }

  /**
   * Remove a file
   */
  async remove(variantId: string, fileId: string): Promise<boolean> {
    return this.storage.deleteFile(variantId, fileId);
  }

  /**
   * Update file metadata
   */
  async updateMetadata(
    variantId: string,
    fileId: string,
    metadata: Partial<MediaFileMetadata>,
  ): Promise<AssetFile> {
    const file = await this.storage.getFile(variantId, fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    file.metadata = { ...file.metadata, ...metadata };
    await this.storage.saveFile(variantId, file);
    return file;
  }

  /**
   * Extract file name from path
   */
  private extractFileName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] ?? filePath;
  }
}
