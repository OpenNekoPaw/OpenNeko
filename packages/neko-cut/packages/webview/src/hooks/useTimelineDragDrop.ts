/**
 * useTimelineDragDrop Hook
 * 管理文件拖放导入逻辑
 *
 * Race-condition fixes (2026-03-04):
 * 1. Drop data is extracted synchronously during the event handler; async
 *    processing is serialized via dropQueueRef so rapid successive drops never
 *    interleave Zustand state reads.
 * 2. Track resolution uses getCurrentTracks() (live store state) instead of
 *    the stale React-closure snapshot of project.tracks, preventing duplicate
 *    track creation when multiple files are dropped in one gesture.
 */

import { useCallback, useState, useRef, RefObject } from 'react';
import {
  PIXELS_PER_SECOND,
  TRACK_HEIGHT,
  TRACK_LABEL_WIDTH,
  DEFAULT_IMAGE_DURATION,
  DEFAULT_VIDEO_DURATION,
} from '../constants';
import { getFileType } from '../utils';
import type { ProjectData, TimelineTrack, TimelineElement } from '../types';
import {
  CENTERED_TRANSFORM,
  ASSET_DRAG_MIME,
  createProjectSourceAddClient,
  getDragItems,
  type AssetDragData,
  type SubtitleElement,
} from '@neko/shared';
import { getMediaInfoService } from '../services';
import { getLogger } from '../utils/logger';
import { importSubtitles } from '../utils/subtitleParser';
import { postMessage } from '../utils/vscodeApi';

const logger = getLogger('useTimelineDragDrop');
const SUBTITLE_FILE_READ_END = 512 * 1024 - 1;
const PROJECT_SOURCE_ADD_TIMEOUT_MS = 30000;

export interface TimelineDragDropOptions {
  timelineRef: RefObject<HTMLDivElement>;
  tracksRef: RefObject<HTMLDivElement>;
  project: ProjectData | null;
  tracks: TimelineTrack[];
  zoomLevel: number;
  addMediaElement: (
    trackId: string,
    src: string,
    name: string,
    duration: number,
    startTime: number,
  ) => void;
  addMediaElementWithAudio: (
    trackId: string,
    src: string,
    name: string,
    duration: number,
    startTime: number,
  ) => Promise<{ videoElementId: string; audioElementId?: string }>;
  addElement: (trackId: string, element: Omit<TimelineElement, 'id'>) => void;
  addTrack: (type: 'media' | 'audio' | 'text' | 'subtitle', name?: string) => string;
  /**
   * Read current project tracks from the live store state.
   * Prevents stale-snapshot race: track resolution inside async drop processing
   * must see tracks created by earlier files in the same drop batch.
   */
  getCurrentTracks: () => TimelineTrack[];
  /** Optional callback for error feedback (e.g., unsupported file type) */
  onError?: (message: string) => void;
}

export function useTimelineDragDrop({
  timelineRef,
  tracksRef,
  project,
  tracks,
  zoomLevel,
  addMediaElement,
  addMediaElementWithAudio,
  addElement,
  addTrack,
  getCurrentTracks,
  onError,
}: TimelineDragDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Serializes concurrent drops — each drop's async processing completes before
  // the next begins, preventing interleaved track-creation state reads.
  const dropQueueRef = useRef<Promise<void>>(Promise.resolve());

  const decodeBase64Utf8 = useCallback((base64: string): string => {
    const binary = window.atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }, []);

  const readSubtitleFileFromPath = useCallback(
    (filePath: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const requestId = `subtitle-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        const handleMessage = (event: MessageEvent) => {
          const message = event.data;
          if (!message || message.type !== 'fileRangeResult' || message.requestId !== requestId) {
            return;
          }

          window.removeEventListener('message', handleMessage);

          if (!message.success || typeof message.data !== 'string') {
            reject(new Error(message.error ?? `Failed to read subtitle file: ${filePath}`));
            return;
          }

          try {
            resolve(decodeBase64Utf8(message.data));
          } catch (error) {
            reject(error instanceof Error ? error : new Error('Failed to decode subtitle file'));
          }
        };

        window.addEventListener('message', handleMessage);
        postMessage({
          type: 'readFileRange',
          requestId,
          path: filePath,
          start: 0,
          end: SUBTITLE_FILE_READ_END,
        });
      }),
    [decodeBase64Utf8],
  );

  const registerDroppedSource = useCallback(
    async (input: {
      readonly sourcePath?: string;
      readonly file?: File;
      readonly displayName: string;
      readonly requestIndex: number;
    }): Promise<string | null> => {
      const requestId = `timeline-drop-${Date.now()}-${input.requestIndex}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const client = createProjectSourceAddClient({
        createRequestId: () => requestId,
        postMessage,
        addMessageListener: (listener) => {
          const handleMessage = (event: MessageEvent) => listener(event.data);
          window.addEventListener('message', handleMessage);
          return () => window.removeEventListener('message', handleMessage);
        },
        timeoutMs: PROJECT_SOURCE_ADD_TIMEOUT_MS,
      });

      const result = await client.addSource({
        kind: 'drag-drop',
        formatId: 'nkv',
        ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
        ...(input.file ? { file: input.file } : { browserFile: { name: input.displayName } }),
        destination: {
          kind: 'project',
          directory: 'media',
          copyMode: input.sourcePath ? 'link' : 'copy',
        },
        ingestMode: input.sourcePath ? 'link' : 'create-asset',
      });

      if (result.ok && result.durablePath) {
        return result.durablePath;
      }

      const detail = result.diagnostics[0]?.message ?? `Failed to add ${input.displayName}`;
      onError?.(detail);
      return null;
    },
    [onError],
  );

  const importSubtitleTrack = useCallback(
    async (
      filePath: string,
      displayName: string,
      startTime: number,
      targetTrack: TimelineTrack | undefined,
      file?: File,
    ): Promise<boolean> => {
      try {
        const content = file ? await file.text() : await readSubtitleFileFromPath(filePath);
        const importedTrack = importSubtitles(content);
        if (!importedTrack || importedTrack.cues.length === 0) {
          onError?.(`Failed to parse subtitle file: ${displayName}`);
          return false;
        }

        let subtitleTrackId = targetTrack?.type === 'subtitle' ? targetTrack.id : '';
        if (!subtitleTrackId) {
          const trackName = displayName.replace(/\.[^.]+$/, '');
          subtitleTrackId = addTrack('subtitle', trackName);
        }

        for (const cue of importedTrack.cues) {
          const subtitleElement: Omit<SubtitleElement, 'id'> = {
            type: 'subtitle',
            name: `${cue.text.substring(0, 30)}${cue.text.length > 30 ? '...' : ''}`,
            text: cue.text,
            fontSize: importedTrack.style.fontSize,
            color: importedTrack.style.color,
            fontFamily: importedTrack.style.fontFamily,
            backgroundColor: importedTrack.style.backgroundColor,
            textAlign: importedTrack.style.alignment,
            strokeColor: importedTrack.style.outlineColor,
            strokeWidth: importedTrack.style.outlineWidth,
            startTime: startTime + cue.startTime,
            duration: Math.max(0, cue.endTime - cue.startTime),
            trimStart: 0,
            trimEnd: 0,
            transform: CENTERED_TRANSFORM,
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          };
          addElement(subtitleTrackId, subtitleElement);
        }

        return true;
      } catch (error) {
        logger.error('Subtitle import failed:', error);
        onError?.(`Failed to import subtitle file: ${displayName}`);
        return false;
      }
    },
    [addElement, addTrack, onError, readSubtitleFileFromPath],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only clear when leaving the timeline entirely
      if (!timelineRef.current?.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    },
    [timelineRef],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!project) return;

      // ── Synchronous extraction ─────────────────────────────────────────────
      // dataTransfer data is only accessible during the synchronous event handler.
      // Extract everything before returning so the queued async function has access.
      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0) - TRACK_LABEL_WIDTH;
      const y = e.clientY - rect.top + (tracksRef.current?.scrollTop || 0);
      const dropTime = Math.max(0, x / (PIXELS_PER_SECOND * zoomLevel));
      const trackIndex = Math.floor(y / TRACK_HEIGHT);
      const targetTrack = tracks[trackIndex];

      const jsonData = e.dataTransfer.getData(ASSET_DRAG_MIME);
      const uriList = e.dataTransfer.getData('text/uri-list');
      const filesSnapshot: Array<{ name: string; path: string; file?: File }> = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]!;
        const filePath = (file as File & { path?: string }).path;
        filesSnapshot.push({
          name: file.name,
          path: filePath ?? '',
          file,
        });
      }

      // ── Inner helpers (defined at event time, close over live callbacks) ──

      /** Add a single file to the appropriate timeline track */
      const addFileToTrack = async (
        filePath: string,
        displayName: string,
        startTime: number,
        file?: File,
        requestIndex = 0,
      ): Promise<boolean> => {
        const fileType = getFileType(displayName);
        if (!fileType) {
          const ext = displayName.slice(displayName.lastIndexOf('.')).toLowerCase();
          onError?.(`Unsupported file type: ${ext || 'unknown'}`);
          return false;
        }

        if (fileType === 'subtitle') {
          return importSubtitleTrack(filePath, displayName, startTime, targetTrack, file);
        }

        const durablePath = await registerDroppedSource({
          sourcePath: filePath || undefined,
          file,
          displayName,
          requestIndex,
        });
        if (!durablePath) {
          return false;
        }

        if (fileType === 'audio') {
          let audioTrackId = targetTrack?.type === 'audio' ? targetTrack.id : '';
          if (!audioTrackId) {
            // Use live state — avoids duplicate audio tracks across multi-file drops
            const existing = getCurrentTracks().find((t) => t.type === 'audio');
            audioTrackId = existing ? existing.id : addTrack('audio');
          }
          let duration = DEFAULT_VIDEO_DURATION;
          try {
            duration = await getMediaInfoService().getDuration(durablePath);
          } catch (err) {
            logger.warn('Failed to get audio duration:', err);
          }
          addMediaElement(audioTrackId, durablePath, displayName, duration, startTime);
        } else {
          // video or image
          let mediaTrackId = targetTrack?.type === 'media' ? targetTrack.id : '';
          if (!mediaTrackId) {
            // Use live state — avoids duplicate media tracks across multi-file drops
            const existing = getCurrentTracks().find((t) => t.type === 'media');
            mediaTrackId = existing ? existing.id : addTrack('media');
          }
          if (fileType === 'video') {
            let duration = DEFAULT_VIDEO_DURATION;
            try {
              duration = await getMediaInfoService().getDuration(durablePath);
            } catch (err) {
              logger.warn('Failed to get video duration:', err);
            }
            // addMediaElementWithAudio awaits audio/subtitle detection internally,
            // so the next file won't start until this one's linked tracks are created.
            await addMediaElementWithAudio(
              mediaTrackId,
              durablePath,
              displayName,
              duration,
              startTime,
            );
          } else {
            // image — no audio detection needed
            addMediaElement(
              mediaTrackId,
              durablePath,
              displayName,
              DEFAULT_IMAGE_DURATION,
              startTime,
            );
          }
        }
        return true;
      };

      /** Process the extracted drop snapshot asynchronously */
      const processDropItems = async (): Promise<void> => {
        // Priority 1: asset library drag data
        if (jsonData) {
          try {
            const data = JSON.parse(jsonData) as AssetDragData;
            const items = getDragItems(data);
            if (items.length > 0) {
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item?.files && item.files.length > 0) {
                  const file = item.files[0];
                  if (file) {
                    await addFileToTrack(file.path, file.name, dropTime + i * 0.5, undefined, i);
                  }
                }
              }
              return;
            }
          } catch {
            logger.debug('JSON parse failed, trying other handlers');
          }
        }

        // Priority 2: VSCode Explorer / URI list (extracted synchronously above)
        if (uriList) {
          const uris = uriList
            .split('\n')
            .map((u) => u.trim())
            .filter((u) => u && !u.startsWith('#'));
          for (let idx = 0; idx < uris.length; idx++) {
            let filePath = uris[idx]!;
            if (filePath.startsWith('file://')) {
              filePath = decodeURIComponent(filePath.slice(7));
              // Windows: remove leading slash from /C:/...
              if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
            }
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'media';
            await addFileToTrack(filePath, fileName, dropTime + idx * 0.5, undefined, idx);
          }
          return;
        }

        // Priority 3: OS file manager drop (files extracted synchronously above)
        for (let i = 0; i < filesSnapshot.length; i++) {
          const file = filesSnapshot[i]!;
          await addFileToTrack(file.path, file.name, dropTime + i * 0.5, file.file, i);
        }
      };

      // ── Enqueue async processing ───────────────────────────────────────────
      // Chain onto the queue so each drop completes before the next begins.
      dropQueueRef.current = dropQueueRef.current
        .then(() => processDropItems())
        .catch((err: unknown) => {
          logger.error('Error processing drop:', err);
          onError?.('Failed to process dropped files');
        });
    },
    [
      project,
      tracks,
      zoomLevel,
      addMediaElement,
      addMediaElementWithAudio,
      addElement,
      addTrack,
      getCurrentTracks,
      tracksRef,
      onError,
      registerDroppedSource,
      importSubtitleTrack,
    ],
  );

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
