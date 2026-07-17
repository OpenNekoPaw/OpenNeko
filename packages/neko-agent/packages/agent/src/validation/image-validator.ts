/**
 * Image Validator
 *
 * Validates image content parts for size, format, and dimensions
 */

import type { ImagePart } from '@neko/shared';
import type { ImageConstraints, ImageInfo, ValidationError } from './types';
import { DEFAULT_IMAGE_CONSTRAINTS } from './types';

/**
 * Custom error class for validation errors
 */
export class ImageValidationError extends Error {
  readonly type = 'image' as const;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ImageValidationError';
    this.code = code;
    this.details = details;
  }

  toValidationError(): ValidationError {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * ImageValidator - Validates image content before sending to LLM
 */
export class ImageValidator {
  private readonly constraints: ImageConstraints;

  constructor(constraints: Partial<ImageConstraints> = {}) {
    this.constraints = {
      ...DEFAULT_IMAGE_CONSTRAINTS,
      ...constraints,
    };
  }

  /**
   * Validate an image part
   * @throws ImageValidationError if validation fails
   */
  async validate(part: ImagePart): Promise<ImagePart> {
    const info = this.parseImageInfo(part.imageUrl);

    // 1. Check format
    this.validateFormat(info);

    // 2. Check size (only for data URLs where we can measure)
    if (info.isDataUrl) {
      this.validateSize(info);
    }

    return part;
  }

  /**
   * Validate multiple image parts
   */
  async validateAll(parts: ImagePart[]): Promise<ImagePart[]> {
    return Promise.all(parts.map((part) => this.validate(part)));
  }

  /**
   * Parse image information from URL or data URL
   */
  parseImageInfo(imageUrl: string): ImageInfo {
    const isDataUrl = imageUrl.startsWith('data:');

    if (isDataUrl) {
      return this.parseDataUrl(imageUrl);
    }

    return this.parseUrl(imageUrl);
  }

  /**
   * Parse data URL to extract MIME type and size
   * Format: data:[<mediatype>][;base64],<data>
   */
  private parseDataUrl(dataUrl: string): ImageInfo {
    // Extract media type
    const colonIndex = dataUrl.indexOf(':');
    const semicolonIndex = dataUrl.indexOf(';');
    const commaIndex = dataUrl.indexOf(',');

    if (colonIndex === -1 || commaIndex === -1) {
      throw new ImageValidationError('INVALID_DATA_URL', 'Invalid data URL format', {
        url: dataUrl.substring(0, 50) + '...',
      });
    }

    const mimeType =
      semicolonIndex > colonIndex
        ? dataUrl.substring(colonIndex + 1, semicolonIndex)
        : dataUrl.substring(colonIndex + 1, commaIndex);

    // Calculate base64 size
    const base64Data = dataUrl.substring(commaIndex + 1);
    const sizeBytes = this.calculateBase64Size(base64Data);

    return {
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes,
      isDataUrl: true,
      url: dataUrl,
    };
  }

  /**
   * Parse URL to infer MIME type from extension
   */
  private parseUrl(url: string): ImageInfo {
    // Try to infer MIME type from URL extension
    const mimeType = this.inferMimeTypeFromUrl(url);

    return {
      mimeType,
      sizeBytes: 0, // Unknown for URLs
      isDataUrl: false,
      url,
    };
  }

  /**
   * Infer MIME type from URL extension
   */
  private inferMimeTypeFromUrl(url: string): string {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new ImageValidationError('INVALID_IMAGE_URL', 'Image URL is not a valid URL', {
        url,
      });
    }

    const pathname = parsedUrl.pathname.toLowerCase();
    const extension = pathname.includes('.') ? pathname.split('.').pop() : undefined;

    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
    };

    const mimeType = extension ? mimeTypes[extension] : undefined;
    if (!mimeType) {
      throw new ImageValidationError(
        'UNKNOWN_IMAGE_MIME_TYPE',
        'Image URL must include a supported image file extension',
        {
          url,
          path: parsedUrl.pathname,
          allowedExtensions: Object.keys(mimeTypes),
        },
      );
    }

    return mimeType;
  }

  /**
   * Calculate the actual byte size of base64 encoded data
   * Base64 encodes 3 bytes into 4 characters
   */
  private calculateBase64Size(base64Data: string): number {
    // Remove any whitespace
    const cleanData = base64Data.replace(/\s/g, '');

    // Calculate padding
    let padding = 0;
    if (cleanData.endsWith('==')) {
      padding = 2;
    } else if (cleanData.endsWith('=')) {
      padding = 1;
    }

    // Base64 formula: (length * 3) / 4 - padding
    return Math.floor((cleanData.length * 3) / 4) - padding;
  }

  /**
   * Validate image format against allowed formats
   */
  private validateFormat(info: ImageInfo): void {
    if (!this.constraints.allowedFormats.includes(info.mimeType)) {
      throw new ImageValidationError(
        'UNSUPPORTED_FORMAT',
        `Image format '${info.mimeType}' is not supported. Allowed formats: ${this.constraints.allowedFormats.join(', ')}`,
        {
          mimeType: info.mimeType,
          allowedFormats: this.constraints.allowedFormats,
        },
      );
    }
  }

  /**
   * Validate image size against maximum allowed
   */
  private validateSize(info: ImageInfo): void {
    if (info.sizeBytes > this.constraints.maxSizeBytes) {
      const sizeMB = (info.sizeBytes / 1024 / 1024).toFixed(2);
      const maxMB = (this.constraints.maxSizeBytes / 1024 / 1024).toFixed(0);

      throw new ImageValidationError(
        'SIZE_EXCEEDED',
        `Image size ${sizeMB}MB exceeds maximum allowed ${maxMB}MB`,
        {
          sizeBytes: info.sizeBytes,
          maxSizeBytes: this.constraints.maxSizeBytes,
        },
      );
    }
  }

  /**
   * Get current constraints
   */
  getConstraints(): ImageConstraints {
    return { ...this.constraints };
  }
}

/**
 * Factory function to create ImageValidator
 */
export function createImageValidator(constraints?: Partial<ImageConstraints>): ImageValidator {
  return new ImageValidator(constraints);
}
