import { describe, it, expect } from 'vitest';
import {
  getFileExtension,
  detectMediaType,
  getMimeType,
  isMediaFile,
  isDocumentFile,
  isImageSequence,
  isSubtitleFile,
  getExtensionsForType,
} from '../media';

// =============================================================================
// getFileExtension
// =============================================================================

describe('getFileExtension', () => {
  it('extracts extension from simple filename', () => {
    expect(getFileExtension('video.mp4')).toBe('mp4');
  });

  it('extracts extension from path with directories', () => {
    expect(getFileExtension('/path/to/video.MP4')).toBe('mp4');
  });

  it('handles Windows-style paths', () => {
    expect(getFileExtension('C:\\Users\\media\\clip.mov')).toBe('mov');
  });

  it('returns lowercase', () => {
    expect(getFileExtension('IMAGE.PNG')).toBe('png');
    expect(getFileExtension('audio.FLAC')).toBe('flac');
  });

  it('returns empty string for files without extension', () => {
    expect(getFileExtension('no-extension')).toBe('');
    expect(getFileExtension('/path/to/Makefile')).toBe('');
  });

  it('returns empty string for trailing dot', () => {
    expect(getFileExtension('file.')).toBe('');
  });

  it('handles multiple dots', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
    expect(getFileExtension('render.1234.png')).toBe('png');
  });
});

// =============================================================================
// detectMediaType
// =============================================================================

describe('detectMediaType', () => {
  describe('video types', () => {
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v', 'ts', 'wmv'];

    it.each(videoExts)('detects .%s as video', (ext) => {
      expect(detectMediaType(`file.${ext}`)).toBe('video');
    });
  });

  describe('audio types', () => {
    const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'opus'];

    it.each(audioExts)('detects .%s as audio', (ext) => {
      expect(detectMediaType(`file.${ext}`)).toBe('audio');
    });
  });

  describe('image types', () => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif'];

    it.each(imageExts)('detects .%s as image', (ext) => {
      expect(detectMediaType(`file.${ext}`)).toBe('image');
    });
  });

  describe('text types', () => {
    const textExts = ['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'xml'];

    it.each(textExts)('detects .%s as text', (ext) => {
      expect(detectMediaType(`file.${ext}`)).toBe('text');
    });
  });

  describe('subtitle types (mapped to text)', () => {
    const subtitleExts = ['srt', 'vtt', 'ass', 'ssa', 'sub'];

    it.each(subtitleExts)('detects .%s as text', (ext) => {
      expect(detectMediaType(`file.${ext}`)).toBe('text');
    });
  });

  describe('document types', () => {
    const documentExts = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'epub', 'cbz', 'cbr'];

    it.each(documentExts)('detects .%s as document', (ext) => {
      expect(detectMediaType(`file.${ext}`)).toBe('document');
      expect(isDocumentFile(`file.${ext}`)).toBe(true);
    });
  });

  describe('image sequence detection', () => {
    it('detects image files with 3+ digits as sequence', () => {
      expect(detectMediaType('frame_001.png')).toBe('sequence');
      expect(detectMediaType('shot_0001.jpg')).toBe('sequence');
      expect(detectMediaType('/path/to/render.1234.png')).toBe('sequence');
    });

    it('does not detect images with fewer than 3 digits as sequence', () => {
      expect(detectMediaType('photo_01.png')).toBe('image');
      expect(detectMediaType('v2.png')).toBe('image');
    });

    it('does not detect non-image files as sequence', () => {
      expect(detectMediaType('clip_001.mp4')).toBe('video');
      expect(detectMediaType('audio_001.wav')).toBe('audio');
    });

    it('ignores digits in directory path', () => {
      // Digits in directory names should not trigger sequence detection
      expect(detectMediaType('/project/v001/photo.png')).toBe('image');
    });
  });

  describe('edge cases', () => {
    it('returns image for unknown extensions', () => {
      expect(detectMediaType('file.xyz')).toBe('image');
      expect(detectMediaType('file.unknown')).toBe('image');
    });

    it('handles uppercase extensions', () => {
      expect(detectMediaType('VIDEO.MP4')).toBe('video');
      expect(detectMediaType('IMAGE.PNG')).toBe('image');
    });

    it('handles paths with spaces', () => {
      expect(detectMediaType('/my files/video clip.mp4')).toBe('video');
    });
  });
});

// =============================================================================
// getMimeType
// =============================================================================

describe('getMimeType', () => {
  it('returns correct MIME for video types', () => {
    expect(getMimeType('file.mp4')).toBe('video/mp4');
    expect(getMimeType('file.mov')).toBe('video/quicktime');
    expect(getMimeType('file.mkv')).toBe('video/x-matroska');
    expect(getMimeType('file.webm')).toBe('video/webm');
  });

  it('returns correct MIME for audio types', () => {
    expect(getMimeType('file.mp3')).toBe('audio/mpeg');
    expect(getMimeType('file.wav')).toBe('audio/wav');
    expect(getMimeType('file.flac')).toBe('audio/flac');
    expect(getMimeType('file.opus')).toBe('audio/opus');
  });

  it('returns correct MIME for image types', () => {
    expect(getMimeType('file.jpg')).toBe('image/jpeg');
    expect(getMimeType('file.jpeg')).toBe('image/jpeg');
    expect(getMimeType('file.png')).toBe('image/png');
    expect(getMimeType('file.svg')).toBe('image/svg+xml');
  });

  it('returns correct MIME for text types', () => {
    expect(getMimeType('file.json')).toBe('application/json');
    expect(getMimeType('file.csv')).toBe('text/csv');
    expect(getMimeType('file.md')).toBe('text/markdown');
  });

  it('returns correct MIME for subtitle types', () => {
    expect(getMimeType('file.srt')).toBe('application/x-subrip');
    expect(getMimeType('file.vtt')).toBe('text/vtt');
  });

  it('returns correct MIME for document archives', () => {
    expect(getMimeType('file.epub')).toBe('application/epub+zip');
    expect(getMimeType('file.cbz')).toBe('application/x-cbz');
    expect(getMimeType('file.cbr')).toBe('application/vnd.comicbook-rar');
  });

  it('returns application/octet-stream for unknown types', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
    expect(getMimeType('no-ext')).toBe('application/octet-stream');
  });
});

// =============================================================================
// isMediaFile
// =============================================================================

describe('isMediaFile', () => {
  it('returns true for video files', () => {
    expect(isMediaFile('clip.mp4')).toBe(true);
  });

  it('returns true for audio files', () => {
    expect(isMediaFile('track.mp3')).toBe(true);
  });

  it('returns true for image files', () => {
    expect(isMediaFile('photo.png')).toBe(true);
  });

  it('returns false for text files', () => {
    expect(isMediaFile('readme.md')).toBe(false);
  });

  it('returns false for subtitle files', () => {
    expect(isMediaFile('sub.srt')).toBe(false);
  });

  it('returns false for unknown extensions', () => {
    expect(isMediaFile('file.xyz')).toBe(false);
  });
});

// =============================================================================
// isImageSequence
// =============================================================================

describe('isImageSequence', () => {
  it('detects 3+ digit sequences', () => {
    expect(isImageSequence('frame_001.png')).toBe(true);
    expect(isImageSequence('render.0001.exr')).toBe(true);
    expect(isImageSequence('shot_12345.jpg')).toBe(true);
  });

  it('rejects fewer than 3 digits', () => {
    expect(isImageSequence('v01.png')).toBe(false);
    expect(isImageSequence('photo_12.jpg')).toBe(false);
  });

  it('ignores digits in directory path', () => {
    expect(isImageSequence('/v001/photo.png')).toBe(false);
  });

  it('checks filename only, not extension', () => {
    expect(isImageSequence('frame.png')).toBe(false);
  });
});

// =============================================================================
// isSubtitleFile
// =============================================================================

describe('isSubtitleFile', () => {
  it('detects subtitle formats', () => {
    expect(isSubtitleFile('sub.srt')).toBe(true);
    expect(isSubtitleFile('sub.vtt')).toBe(true);
    expect(isSubtitleFile('sub.ass')).toBe(true);
    expect(isSubtitleFile('sub.ssa')).toBe(true);
    expect(isSubtitleFile('sub.sub')).toBe(true);
  });

  it('rejects non-subtitle formats', () => {
    expect(isSubtitleFile('video.mp4')).toBe(false);
    expect(isSubtitleFile('readme.txt')).toBe(false);
  });
});

// =============================================================================
// getExtensionsForType
// =============================================================================

describe('getExtensionsForType', () => {
  it('returns video extensions', () => {
    const exts = getExtensionsForType('video');
    expect(exts).toContain('mp4');
    expect(exts).toContain('mov');
    expect(exts).toContain('mkv');
    expect(exts).not.toContain('mp3');
  });

  it('returns audio extensions', () => {
    const exts = getExtensionsForType('audio');
    expect(exts).toContain('mp3');
    expect(exts).toContain('wav');
    expect(exts).not.toContain('mp4');
  });

  it('returns image extensions', () => {
    const exts = getExtensionsForType('image');
    expect(exts).toContain('png');
    expect(exts).toContain('jpg');
    expect(exts).not.toContain('mp4');
  });

  it('returns text extensions including subtitles', () => {
    const exts = getExtensionsForType('text');
    expect(exts).toContain('txt');
    expect(exts).toContain('srt');
    expect(exts).toContain('vtt');
  });
});
