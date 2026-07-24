import { useCallback, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileDropOptions {
  /**
   * Filter accepted file extensions (e.g. `['mp3','wav']`)
   * or MIME prefixes (e.g. `['image/','video/']`).
   * When set, native files and URIs that don't match are silently ignored.
   */
  accept?: string[];
  /** Max file size in bytes (native files only). Oversized files are skipped. */
  maxSize?: number;
  /** Parse `text/uri-list` from VSCode explorer drops (default true). */
  parseUriList?: boolean;
  /** Parse supported structured drag payloads from `application/json` (default true). */
  parseJson?: boolean;
  /** Read native File objects from the DataTransfer (default true). */
  parseNativeFiles?: boolean;
}

export type FileDropResultType = 'uri-list' | 'json' | 'native-file';

export interface FileDropResult {
  type: FileDropResultType;
  /** Parsed URIs (for 'uri-list'). */
  uris?: string[];
  /** Raw parsed JSON payload (for 'json'). Consumer validates its domain contract. */
  data?: unknown;
  /** Native File objects (for 'native-file'). */
  files?: File[];
}

export interface FileDropBindings {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function matchesAccept(nameOrMime: string, accept: string[]): boolean {
  const ext = getExtension(nameOrMime);
  const mime = nameOrMime.toLowerCase();
  return accept.some(
    (filter) =>
      filter === ext || (filter.endsWith('/') && mime.startsWith(filter)) || mime === filter,
  );
}

function parseUriList(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Unified HTML5 file-drop hook for VSCode webviews.
 *
 * Handles three drop sources:
 *   1. VSCode explorer / external URI lists (`text/uri-list`)
 *   2. Structured extension payloads (`application/json`)
 *   3. Native File objects (filesystem drag)
 *
 * ```tsx
 * const { isDragOver, dropProps } = useFileDrop((result) => {
 *   if (result.type === 'uri-list') postMessage({ type: 'drop', uris: result.uris });
 *   if (result.type === 'native-file') handleFiles(result.files!);
 * }, { accept: ['mp3', 'wav'] });
 *
 * return <div {...dropProps} className={isDragOver ? 'highlight' : ''} />;
 * ```
 */
export function useFileDrop(
  onDrop: (result: FileDropResult, event: React.DragEvent) => void,
  options?: FileDropOptions,
): {
  isDragOver: boolean;
  dropProps: FileDropBindings;
} {
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const types = Array.from(e.dataTransfer.types);
    const hasExternalPayload =
      types.includes('Files') ||
      types.includes('text/uri-list') ||
      types.includes('application/json');
    if (!hasExternalPayload) return;
    counterRef.current++;
    if (counterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (counterRef.current <= 0) return;
    counterRef.current--;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    counterRef.current = 0;
    setIsDragOver(false);

    const opts = optionsRef.current;
    const doUriList = opts?.parseUriList !== false;
    const doJson = opts?.parseJson !== false;
    const doNativeFiles = opts?.parseNativeFiles !== false;
    const accept = opts?.accept;
    const maxSize = opts?.maxSize;
    const dt = e.dataTransfer;

    // Priority 1: structured extension payloads
    if (doJson) {
      const jsonStr = dt.getData('application/json');
      if (jsonStr) {
        try {
          const data: unknown = JSON.parse(jsonStr);
          onDropRef.current({ type: 'json', data }, e);
          return;
        } catch {
          // fall through
        }
      }
    }

    // Priority 2: text/uri-list (VSCode explorer)
    if (doUriList) {
      const uriStr = dt.getData('text/uri-list') || dt.getData('text/plain');
      if (uriStr) {
        let uris = parseUriList(uriStr);
        if (accept && accept.length > 0) {
          uris = uris.filter((u) => matchesAccept(u, accept));
        }
        if (uris.length > 0) {
          onDropRef.current({ type: 'uri-list', uris }, e);
          return;
        }
      }
    }

    // Priority 3: native File objects
    if (doNativeFiles && dt.files.length > 0) {
      let files = Array.from(dt.files);
      if (accept && accept.length > 0) {
        files = files.filter((f) => matchesAccept(f.name, accept) || matchesAccept(f.type, accept));
      }
      if (maxSize !== undefined) {
        files = files.filter((f) => f.size <= maxSize);
      }
      if (files.length > 0) {
        onDropRef.current({ type: 'native-file', files }, e);
      }
    }
  }, []);

  return {
    isDragOver,
    dropProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
