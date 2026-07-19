// TODO(P2): Duplicated thin Webview messaging hook.
// that delegates to the shared VS Code bridge and owns its message listener.
// This version adds heavy domain logic (timeline, export, context menu, AI actions).
// This thin wrapper pattern could be extracted to
// @neko/shared/hooks/useVSCodeMessaging as a generic base, with this hook
// composing domain-specific handlers on top of it.

import { useEffect, useCallback, useRef, useState } from 'react';
import { useEditorStore, type EditorStore } from '../stores/editor-store';
import type { EditorSubtitleElement, ProjectData, TextElement, TimelineTrack } from '../types';
import { getLogger } from '../utils/logger';

import { DEFAULT_IMAGE_DURATION, DEFAULT_VIDEO_DURATION } from '../constants';
import { getMediaType, type MediaType } from '../utils';
import { getMediaInfoService } from '../services';
import {
  CENTERED_TRANSFORM,
  isProjectFileSnapshotRequestMessage,
  PROJECT_FILE_SNAPSHOT_RESPONSE,
} from '@neko/shared';
import { getVSCodeAPI, postMessage } from '../utils/vscodeApi';
import {
  getFileUri as getFileUriAsync,
  handleFileUriResponse,
  requestFileUri as requestFileUriUtil,
} from '../utils/fileUri';
import {
  buildCanvasDraftTimelineSyncPayload,
  buildStoryboardMediaElement,
  buildStoryboardMetadataCues,
  buildStoryboardImageClips,
  normalizeCutStoryboardImportPayload,
  projectCanvasCutDraftToStoryboardImportResult,
} from '../utils/storyboardImport';
import type { CutStoryboardImportPayload } from '../utils/storyboardImport';
import { isFrameServerMessage, publishFrameServerMessage } from '../services/frameServerMessages';
import type { ProjectSourceAddResult } from '@neko/shared';
import {
  isProjectChangedSyncSuppressed,
  suppressProjectChangedSync,
} from '../stores/utils/extension-sync';

const logger = getLogger('useVSCodeMessaging');

// Get VSCode API singleton
const vscode = getVSCodeAPI();

// Pending context menu callbacks
const pendingContextMenuCallbacks = new Map<string, (selectedId?: string) => void>();

export interface UseVSCodeMessagingOptions {
  readonly subscribeToExtensionMessages?: boolean;
}

export interface CutEngineDiagnostic {
  readonly code: 'cut.engine.unavailable';
  readonly message: string;
}

export function useVSCodeMessaging(options: UseVSCodeMessagingOptions = {}) {
  const subscribeToExtensionMessages = options.subscribeToExtensionMessages === true;
  const {
    setProject,
    project,
    currentTime,
    isPlaying,
    selectElement,
    seek,
    setAIActionStatus,
    addElement,
    addTrack,
    getTotalDuration,
  } = useEditorStore();
  const projectRef = useRef(project);
  const [engineDiagnostic, setEngineDiagnostic] = useState<CutEngineDiagnostic | undefined>();

  projectRef.current = project;

  // Send message to Extension Host (uses centralized postMessage)
  const sendMessage = useCallback((message: unknown) => {
    postMessage(message);
  }, []);

  // Send status update to Extension Host for status bar
  const sendStatusUpdate = useCallback(() => {
    if (!vscode || !projectRef.current) return;

    const trackCount = projectRef.current.tracks.length;
    const elementCount = projectRef.current.tracks.reduce(
      (sum: number, track: { elements: unknown[] }) => sum + track.elements.length,
      0,
    );

    sendMessage({
      type: 'statusUpdate',
      currentTime: useEditorStore.getState().currentTime,
      totalDuration: useEditorStore.getState().getTotalDuration(),
      trackCount,
      elementCount,
      isPlaying: useEditorStore.getState().isPlaying,
      fps: projectRef.current.fps,
    });
  }, [sendMessage]);

  useEffect(() => {
    if (!subscribeToExtensionMessages) return;

    let lastSyncedProject = useEditorStore.getState().project;
    return useEditorStore.subscribe((state) => {
      const nextProject = state.project;
      if (nextProject === lastSyncedProject) return;
      lastSyncedProject = nextProject;
      if (!nextProject || isProjectChangedSyncSuppressed()) return;

      sendMessage({ type: 'project:changed', document: nextProject });
    });
  }, [subscribeToExtensionMessages, sendMessage]);

  const importStoryboard = useCallback(
    (payload: CutStoryboardImportPayload, importedAt = Date.now()) => {
      importStoryboardToStore(
        {
          addElement,
          addTrack,
          getTotalDuration,
          project: projectRef.current,
        },
        payload,
        sendMessage,
        importedAt,
      );
    },
    [addElement, addTrack, getTotalDuration, sendMessage],
  );

  // Handle incoming messages from Extension Host
  useEffect(() => {
    if (!subscribeToExtensionMessages) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (isProjectFileSnapshotRequestMessage(message)) {
        const document = useEditorStore.getState().project;
        sendMessage({
          type: PROJECT_FILE_SNAPSHOT_RESPONSE,
          requestId: message.requestId,
          ok: Boolean(document),
          ...(document ? { document } : { error: 'Cut project is not ready.' }),
        });
        return;
      }

      switch (message.type) {
        case 'engine:status':
          if (message.status === 'ready') {
            setEngineDiagnostic(undefined);
          } else if (
            message.status === 'unavailable' &&
            message.diagnostic?.code === 'cut.engine.unavailable' &&
            typeof message.diagnostic.message === 'string'
          ) {
            setEngineDiagnostic({
              code: 'cut.engine.unavailable',
              message: message.diagnostic.message,
            });
          }
          break;

        case 'frameServer:config':
        case 'frameServer:streamCreated':
        case 'frameServer:streamStopped':
          if (isFrameServerMessage(message)) {
            publishFrameServerMessage(message);
          }
          break;

        case 'update':
          const updatedProject: ProjectData = message.content;
          const projectRoot =
            typeof message.projectRoot === 'string' ? message.projectRoot : undefined;
          suppressProjectChangedSync(() => {
            setProject(updatedProject, projectRoot);
          });

          // Pre-request URIs for all media files in the project
          {
            const mediaPaths = new Set<string>();
            for (const track of updatedProject.tracks) {
              for (const element of track.elements) {
                if ((element.type === 'media' || element.type === 'audio') && element.src) {
                  mediaPaths.add(element.src);
                }
              }
            }

            // Request webview URIs for all unique media paths
            for (const mediaPath of mediaPaths) {
              requestFileUriUtil(mediaPath);
            }
          }
          break;

        case 'fileUri':
          // Delegate to shared fileUri module (handles caching, pending promises, listeners)
          if (message.path && message.uri) {
            handleFileUriResponse(message.path as string, message.uri as string);
          }
          break;

        case 'project:sourceAdded':
          if (shouldAddProjectSourceResultToTimeline(message.result)) {
            addProjectSourceResultToTimeline(message.result, sendMessage).catch((err) => {
              logger.error('Failed to add project source to timeline:', err);
            });
          }
          break;

        case 'project:sourceRejected':
          logger.warn(
            message.result?.diagnostics?.[0]?.message ?? 'Project source add was rejected',
          );
          break;

        case 'importStoryboard': {
          const payload = normalizeCutStoryboardImportPayload(message);
          if (!payload) {
            logger.warn('Ignored malformed storyboard import payload');
            break;
          }

          try {
            importStoryboard(payload);
          } catch (err) {
            logger.error('Failed to import storyboard into timeline:', err);
          }
          break;
        }

        case 'importCanvasDraft': {
          const projection = projectCanvasCutDraftToStoryboardImportResult(message.payload);
          if (!projection.ok) {
            sendMessage({
              type: 'canvasDraftImportRejected',
              ...(typeof message.requestId === 'string' ? { requestId: message.requestId } : {}),
              diagnostics: projection.diagnostics,
            });
            logger.warn('Rejected Canvas draft import payload');
            break;
          }

          try {
            const importedAt = Date.now();
            importStoryboard(projection.payload, importedAt);
            sendMessage({
              type: 'canvasTimelineSync',
              ...(typeof message.requestId === 'string' ? { requestId: message.requestId } : {}),
              payload: buildCanvasDraftTimelineSyncPayload(projection.payload, importedAt),
            });
          } catch (err) {
            sendMessage({
              type: 'canvasDraftImportFailed',
              ...(typeof message.requestId === 'string' ? { requestId: message.requestId } : {}),
              error: err instanceof Error ? err.message : String(err),
            });
            logger.error('Failed to import Canvas draft into timeline:', err);
          }
          break;
        }

        case 'saved':
          if (message.content) {
            suppressProjectChangedSync(() => {
              setProject(message.content as ProjectData, message.projectRoot as string | undefined);
            });
          }
          logger.info('Project saved successfully');
          break;

        case 'error':
          logger.error('Error from extension:', message.message);
          break;

        case 'externalChange':
          // File was changed externally - prompt user to reload
          if (message.content) {
            const shouldReload = window.confirm(
              'The file has been changed externally. Do you want to reload it?\n\n' +
                'Click OK to reload (your unsaved changes will be lost) or Cancel to keep your current version.',
            );
            if (shouldReload) {
              suppressProjectChangedSync(() => {
                setProject(
                  message.content as ProjectData,
                  message.projectRoot as string | undefined,
                );
              });
            }
          }
          break;

        case 'requestStatus':
          // Extension is requesting current status (e.g., when webview becomes visible)
          sendStatusUpdate();
          break;

        case 'selectElement':
          // Handle element selection from outline view
          if (message.trackId && message.elementId) {
            // Select the element
            selectElement(message.trackId, message.elementId, false);

            // Find the element to get its start time and jump to it
            if (projectRef.current) {
              const track = projectRef.current.tracks.find((t) => t.id === message.trackId);
              if (track) {
                const element = track.elements.find((el) => el.id === message.elementId);
                if (element) {
                  // Jump to the element's start time
                  seek(element.startTime);

                  // Dispatch custom event to scroll timeline to this element
                  // The Timeline component will listen for this event
                  window.dispatchEvent(
                    new CustomEvent('scrollToElement', {
                      detail: {
                        trackId: message.trackId,
                        elementId: message.elementId,
                        startTime: element.startTime,
                      },
                    }),
                  );

                  logger.info(`Jumped to element at ${element.startTime}s`);
                }
              }
            }
          }
          break;

        case 'exportProgress':
          // Handle export progress from Extension Host FFmpeg
          // Dispatch custom event for ExportPanel to handle
          window.dispatchEvent(
            new CustomEvent('exportProgress', {
              detail: message.progress,
            }),
          );
          break;

        case 'blobSaveResult':
          // Handle blob save result from Extension Host
          window.dispatchEvent(
            new CustomEvent('blobSaveResult', {
              detail: {
                success: message.success,
                error: message.error,
                path: message.path,
              },
            }),
          );
          break;

        // Streaming export messages
        case 'exportDialogResult':
          // Handle export dialog result (user selected file or cancelled)
          window.dispatchEvent(
            new CustomEvent('exportDialogResult', {
              detail: {
                success: message.success,
                cancelled: message.cancelled,
                path: message.path,
                error: message.error,
              },
            }),
          );
          break;

        case 'exportChunkResult':
          // Handle chunk write result
          window.dispatchEvent(
            new CustomEvent('exportChunkResult', {
              detail: {
                success: message.success,
                error: message.error,
              },
            }),
          );
          break;

        case 'exportStreamError':
          // Handle stream error
          window.dispatchEvent(
            new CustomEvent('exportStreamError', {
              detail: { error: message.error },
            }),
          );
          break;

        case 'exportComplete':
          // Handle export completion
          window.dispatchEvent(
            new CustomEvent('exportComplete', {
              detail: {
                success: message.success,
                path: message.path,
                error: message.error,
              },
            }),
          );
          break;

        case 'exportCancelled':
          // Handle export cancellation
          window.dispatchEvent(new CustomEvent('exportCancelled', { detail: {} }));
          break;

        case 'showExportPanel':
          // Handle request to show export panel (from status bar click)
          window.dispatchEvent(new CustomEvent('showExportPanel', { detail: {} }));
          break;

        case 'contextMenuResult':
          // Handle context menu result from Extension Host
          if (message.menuId) {
            const callback = pendingContextMenuCallbacks.get(message.menuId);
            if (callback) {
              callback(message.selectedId);
              pendingContextMenuCallbacks.delete(message.menuId);
            }
          }
          break;

        case 'aiActionStatus':
          // Handle AI action status update from Extension Host
          if (message.actionId && message.status) {
            setAIActionStatus({
              actionId: message.actionId,
              status: message.status,
              progress: message.progress,
              message: message.message,
              error: message.error,
            });
          }
          break;

        default:
          // Ignore media:response:* messages - they are handled by MediaRequestProxy
          // Ignore export:* messages - they are handled by StreamingExportManager
          // Ignore fileRangeResult - handled by initFileRangeListener
          // Ignore audioDecodeResult - handled by setupAudioDecodeListener
          // Ignore mediaEngine:* messages - mode management removed
          if (
            !message.type?.startsWith('media:response:') &&
            !message.type?.startsWith('export:') &&
            !message.type?.startsWith('mediaEngine:') &&
            message.type !== 'fileRangeResult' &&
            message.type !== 'audioDecodeResult'
          ) {
            logger.info('Unknown message type:', message.type);
          }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    subscribeToExtensionMessages,
    setProject,
    sendStatusUpdate,
    selectElement,
    seek,
    setAIActionStatus,
    importStoryboard,
  ]);

  // Send status updates when playback state changes
  useEffect(() => {
    if (!subscribeToExtensionMessages) return;
    if (!project) return;
    sendStatusUpdate();
  }, [subscribeToExtensionMessages, currentTime, isPlaying, project, sendStatusUpdate]);

  // Request file URI for media playback
  const requestFileUri = useCallback(
    (path: string) => {
      sendMessage({ type: 'requestFile', path });
    },
    [sendMessage],
  );

  // Get webview URI for a file path (delegates to shared fileUri module)
  const getFileUri = useCallback((path: string): Promise<string> => {
    return getFileUriAsync(path);
  }, []);

  // Export video
  const exportVideo = useCallback(
    (format: 'mp4' | 'webm', quality: 'low' | 'medium' | 'high') => {
      sendMessage({ type: 'export', format, quality });
    },
    [sendMessage],
  );

  // Streaming export methods
  const showExportDialog = useCallback(
    (filename: string, format: string) => {
      sendMessage({ type: 'showExportDialog', filename, format });
    },
    [sendMessage],
  );

  const writeExportChunk = useCallback((data: Uint8Array) => {
    // Create a copy of the ArrayBuffer for sending
    // VSCode webview handles ArrayBuffer efficiently internally
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (vscode) {
      vscode.postMessage({ type: 'writeExportChunk', data: buffer });
    } else {
      logger.info(`Would send binary chunk: ${data.byteLength} bytes`);
    }
  }, []);

  const finalizeExport = useCallback(
    (success: boolean, error?: string) => {
      sendMessage({ type: 'finalizeExport', success, error });
    },
    [sendMessage],
  );

  const cancelExport = useCallback(() => {
    sendMessage({ type: 'cancelExport' });
  }, [sendMessage]);

  // Send export progress to status bar
  const sendExportProgress = useCallback(
    (info: {
      isExporting: boolean;
      percent: number;
      message: string;
      currentFrame?: number;
      totalFrames?: number;
      currentFps?: number;
      estimatedTimeRemaining?: number;
    }) => {
      sendMessage({ type: 'exportProgress', ...info });
    },
    [sendMessage],
  );

  // Show VSCode native context menu
  const showContextMenu = useCallback(
    (
      items: Array<{
        id: string;
        label: string;
        disabled?: boolean;
        separator?: boolean;
        shortcut?: string;
      }>,
    ): Promise<string | undefined> => {
      return new Promise((resolve) => {
        const menuId = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        pendingContextMenuCallbacks.set(menuId, resolve);
        sendMessage({ type: 'showContextMenu', menuId, items });
      });
    },
    [sendMessage],
  );

  return {
    engineDiagnostic,
    sendMessage,
    requestFileUri,
    getFileUri,
    exportVideo,
    sendStatusUpdate,
    // Streaming export
    showExportDialog,
    writeExportChunk,
    finalizeExport,
    cancelExport,
    // Export progress
    sendExportProgress,
    // Context menu
    showContextMenu,
  };
}

type StoryboardCue = ReturnType<typeof buildStoryboardMetadataCues>[number];
type StoryboardImportStoreActions = Pick<
  EditorStore,
  'addElement' | 'addTrack' | 'getTotalDuration' | 'project'
>;

interface TimelineAddMetadata {
  readonly addToTimeline?: unknown;
  readonly mediaType?: unknown;
  readonly duration?: unknown;
  readonly startTime?: unknown;
  readonly trackId?: unknown;
  readonly name?: unknown;
}

async function addProjectSourceResultToTimeline(
  result: ProjectSourceAddResult | undefined,
  sendMessage: (message: unknown) => void,
): Promise<void> {
  if (!result?.ok || !result.durablePath) {
    const detail = result?.diagnostics?.[0]?.message ?? 'Failed to add media to timeline';
    logger.warn(detail);
    return;
  }

  const metadata = readTimelineAddMetadata(result);
  const mediaType = readTimelineMediaType(metadata, result.durablePath);
  if (!mediaType) {
    logger.warn(`Unsupported timeline media source: ${result.durablePath}`);
    return;
  }

  const { addMediaElement, addMediaElementWithAudio, getTotalDuration } = useEditorStore.getState();
  const startTime =
    typeof metadata.startTime === 'number' ? metadata.startTime : getTotalDuration();
  const fileName =
    typeof metadata.name === 'string' && metadata.name.trim().length > 0
      ? metadata.name
      : result.durablePath.split('/').pop() || result.durablePath;

  let duration =
    typeof metadata.duration === 'number'
      ? metadata.duration
      : mediaType === 'image'
        ? DEFAULT_IMAGE_DURATION
        : DEFAULT_VIDEO_DURATION;
  if (metadata.duration === undefined && mediaType !== 'image') {
    try {
      duration = await getMediaInfoService().getDuration(result.durablePath);
    } catch (error) {
      logger.warn('Failed to get media duration:', error);
    }
  }

  if (mediaType === 'video') {
    await addMediaElementWithAudio('', result.durablePath, fileName, duration, startTime);
  } else {
    addMediaElement('', result.durablePath, fileName, duration, startTime);
  }

  sendMessage({ type: 'requestFile', path: result.durablePath });
  logger.info(`Added ${mediaType} source to timeline: ${result.durablePath}`);
}

function shouldAddProjectSourceResultToTimeline(
  result: ProjectSourceAddResult | undefined,
): boolean {
  return readTimelineAddMetadata(result).addToTimeline === true;
}

function readTimelineAddMetadata(result: ProjectSourceAddResult | undefined): TimelineAddMetadata {
  const metadata = result?.ingest?.request.metadata;
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as TimelineAddMetadata;
}

function readTimelineMediaType(
  metadata: TimelineAddMetadata,
  durablePath: string,
): MediaType | null {
  if (
    metadata.mediaType === 'video' ||
    metadata.mediaType === 'audio' ||
    metadata.mediaType === 'image'
  ) {
    return metadata.mediaType;
  }
  return getMediaType(durablePath);
}

function importStoryboardToStore(
  store: StoryboardImportStoreActions,
  payload: CutStoryboardImportPayload,
  sendMessage: (message: unknown) => void,
  importedAt = Date.now(),
): void {
  const startTime = store.getTotalDuration();
  const clips = buildStoryboardImageClips(payload, startTime);
  const cues = buildStoryboardMetadataCues(payload, startTime);

  for (const clip of clips) {
    const mediaTrackId = findOrCreateStoryboardTrack(
      store.project?.tracks,
      'media',
      'Canvas Draft Media',
      store.addTrack,
    );
    store.addElement(mediaTrackId, buildStoryboardMediaElement(clip, importedAt));
    sendMessage({ type: 'requestFile', path: clip.path });
  }

  const dialogueCues = cues.filter((cue) => cue.kind === 'dialogue');
  if (dialogueCues.length > 0) {
    const subtitleTrackId = findOrCreateStoryboardTrack(
      store.project?.tracks,
      'subtitle',
      'Storyboard Dialogue',
      store.addTrack,
    );
    for (const cue of dialogueCues) {
      store.addElement(subtitleTrackId, createStoryboardSubtitleElement(cue));
    }
  }

  const noteCues = cues.filter((cue) => cue.kind !== 'dialogue');
  if (noteCues.length > 0) {
    const textTrackId = findOrCreateStoryboardTrack(
      store.project?.tracks,
      'text',
      'Storyboard Audio Notes',
      store.addTrack,
    );
    for (const cue of noteCues) {
      store.addElement(textTrackId, createStoryboardTextElement(cue));
    }
  }

  logger.info(
    `Imported ${clips.length} storyboard shots and ${cues.length} metadata cues from ${payload.projectName} into timeline`,
  );
}

function findOrCreateStoryboardTrack(
  tracks: readonly TimelineTrack[] | undefined,
  type: TimelineTrack['type'],
  name: string,
  addTrack: (type: TimelineTrack['type'], name?: string) => string,
): string {
  return (
    tracks?.find((track) => track.type === type && track.name === name)?.id ?? addTrack(type, name)
  );
}

function createStoryboardSubtitleElement(cue: StoryboardCue): Omit<EditorSubtitleElement, 'id'> {
  return {
    type: 'subtitle',
    name: cue.name,
    text: cue.text,
    fontSize: 48,
    color: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: 'transparent',
    textAlign: 'center',
    strokeColor: 'transparent',
    strokeWidth: 0,
    duration: cue.duration,
    startTime: cue.startTime,
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
}

function createStoryboardTextElement(cue: StoryboardCue): Omit<TextElement, 'id'> {
  const prefix = cue.kind === 'voiceOver' ? 'Voice Over' : 'Sound Cue';
  return {
    type: 'text',
    name: cue.name,
    content: `${prefix}: ${cue.text}`,
    fontSize: 36,
    fontFamily: 'Arial',
    color: '#f8fafc',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
    duration: cue.duration,
    startTime: cue.startTime,
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
}
