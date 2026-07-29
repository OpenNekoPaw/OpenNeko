import * as fs from 'node:fs/promises';
import type { NodeMediaRuntime } from '@neko/media/node';
import type { MediaFileMetadata } from '@neko/shared';
import { detectMediaType, getMimeType } from '@neko/shared';

async function extractTextMetadata(filePath: string, metadata: MediaFileMetadata): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    metadata.characterCount = content.length;
    metadata.wordCount = content.split(/\s+/u).filter((word) => word.length > 0).length;
    metadata.lineCount = content.split('\n').length;
    metadata.encoding = 'utf-8';
    metadata.language = /[\u4e00-\u9fa5]/u.test(content) ? 'zh-CN' : 'en';
  } catch {
    // Text metadata is an optional projection; file access errors remain visible to the caller's
    // basic metadata path when the asset is subsequently opened.
  }
}

export function createNodeMediaMetadataExtractor(
  mediaRuntime: NodeMediaRuntime,
): (filePath: string) => Promise<MediaFileMetadata> {
  return async (filePath): Promise<MediaFileMetadata> => {
    let fileSize = 0;
    try {
      fileSize = (await fs.stat(filePath)).size;
    } catch {
      // Generated assets can be indexed before their atomic write is committed.
    }

    const mediaType = detectMediaType(filePath);
    const metadata: MediaFileMetadata = {
      fileSize,
      mimeType: getMimeType(filePath),
    };

    if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'image') {
      const probe = await mediaRuntime.probe(filePath);
      const video = probe.video;
      const audio = probe.audioStreams[0];
      if (probe.durationSeconds > 0) metadata.duration = probe.durationSeconds;
      if (video) {
        metadata.width = video.width;
        metadata.height = video.height;
        metadata.frameRate = video.framesPerSecond;
        metadata.codec = video.codecName;
      } else if (audio) {
        metadata.codec = audio.codecName;
      }
      if (audio?.sampleRate) metadata.sampleRate = audio.sampleRate;
      if (audio?.channels) metadata.channels = audio.channels;
    }

    if (mediaType === 'text') {
      await extractTextMetadata(filePath, metadata);
    }
    return metadata;
  };
}
