/**
 * DropZone - 拖拽上传组件
 * P2: 支持文件/图片拖拽到聊天区域
 */

import { useCallback } from 'react';
import { useFileDrop } from '@neko/shared/components';
import type { FileDropResult } from '@neko/shared/components';
import type { MessageAttachment } from './InputArea/types';
import { getLogger } from '../../utils/logger';

const logger = getLogger('DropZone');

interface DropZoneProps {
  children: React.ReactNode;
  onFilesDropped: (files: MessageAttachment[]) => void;
  disabled?: boolean;
  acceptedTypes?: string[];
  maxSize?: number; // in bytes
}

// Accepted file types by category
const FILE_TYPE_MAP: Record<string, 'image' | 'video' | 'audio' | 'file'> = {
  'image/': 'image',
  'video/': 'video',
  'audio/': 'audio',
};

function getFileType(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
  for (const [prefix, type] of Object.entries(FILE_TYPE_MAP)) {
    if (mimeType.startsWith(prefix)) {
      return type;
    }
  }
  return 'file';
}

// Read file as data URL
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function DropZone({
  children,
  onFilesDropped,
  disabled = false,
  acceptedTypes = ['image/*', 'video/*', 'audio/*'],
  maxSize = 50 * 1024 * 1024, // 50MB default
}: DropZoneProps) {
  // Process dropped files into MessageAttachment objects
  const processFiles = useCallback(async (fileList: File[]): Promise<MessageAttachment[]> => {
    const files: MessageAttachment[] = [];

    for (const file of fileList) {
      const fileType = getFileType(file.type);
      const attachedFile: MessageAttachment = {
        id: `drop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: fileType,
        size: file.size,
      };

      // Create preview for media files
      if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
        try {
          const preview = await readFileAsDataURL(file);
          attachedFile.preview = preview;
        } catch (err) {
          logger.error('Failed to read file preview:', err);
        }
      }

      files.push(attachedFile);
    }

    return files;
  }, []);

  const handleDrop = useCallback(
    async (result: FileDropResult) => {
      if (disabled) return;
      if (result.type === 'native-file' && result.files) {
        const processed = await processFiles(result.files);
        if (processed.length > 0) {
          onFilesDropped(processed);
        }
      }
    },
    [disabled, processFiles, onFilesDropped],
  );

  const { isDragOver, dropProps } = useFileDrop(handleDrop, {
    // Convert 'image/*' → 'image/' for useFileDrop accept format
    accept: acceptedTypes.map((t) => (t.endsWith('/*') ? t.slice(0, -1) : t)),
    maxSize,
    parseUriList: false,
    parseAssetJson: false,
  });

  return (
    <div className="relative w-full h-full" {...dropProps}>
      {children}

      {/* Drop overlay */}
      {isDragOver && !disabled && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--vscode-editor-background)] bg-opacity-90 border-2 border-dashed border-[var(--vscode-focusBorder)] rounded-lg">
          <div className="text-center">
            <UploadIcon className="w-12 h-12 mx-auto mb-3 text-[var(--vscode-focusBorder)]" />
            <p className="text-[14px] font-medium text-[var(--vscode-foreground)]">
              Drop files here
            </p>
            <p className="text-[12px] text-[var(--vscode-descriptionForeground)] mt-1">
              Images, videos, and audio files
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Upload icon
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}
