export type MediaFileType = 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface MediaFileMetadata {
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  frameCount?: number;
  framePattern?: string;
  codec?: string;
  bitrate?: number;
  characterCount?: number;
  wordCount?: number;
  lineCount?: number;
  encoding?: string;
  language?: string;
}
