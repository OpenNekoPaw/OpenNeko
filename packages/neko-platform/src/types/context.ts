/**
 * Project Context Types - Timeline, Media, and Selection context adapters
 */

/**
 * Timeline information
 */
export interface TimelineInfo {
  /** Total duration in seconds */
  duration: number;
  /** Frames per second */
  fps: number;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Number of tracks */
  trackCount: number;
  /** Current playhead position in seconds */
  currentTime: number;
}

/**
 * Track information
 */
export interface TrackInfo {
  /** Unique track ID */
  id: string;
  /** Track name */
  name: string;
  /** Track type */
  type: 'video' | 'audio' | 'subtitle';
  /** Track index (0-based) */
  index: number;
  /** Whether track is locked */
  locked: boolean;
  /** Whether track is visible */
  visible: boolean;
  /** Whether track is muted (audio) */
  muted?: boolean;
}

/**
 * Element information
 */
export interface ElementInfo {
  /** Unique element ID */
  id: string;
  /** Parent track ID */
  trackId: string;
  /** Element type */
  type: 'video' | 'audio' | 'image' | 'text' | 'subtitle' | 'effect';
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Duration in seconds */
  duration: number;
  /** Associated media asset ID */
  mediaId?: string;
  /** Element-specific properties */
  properties: Record<string, unknown>;
}

/**
 * Element input for creation/update
 */
export interface ElementInput {
  /** Element type */
  type: 'video' | 'audio' | 'image' | 'text' | 'subtitle' | 'effect';
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Associated media asset ID */
  mediaId?: string;
  /** Element-specific properties */
  properties?: Record<string, unknown>;
}

/**
 * Media asset information
 */
export interface MediaInfo {
  /** Unique media ID */
  id: string;
  /** Display name */
  name: string;
  /** Media type */
  type: 'video' | 'audio' | 'image';
  /** File path */
  path: string;
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** Width in pixels (for video/image) */
  width?: number;
  /** Height in pixels (for video/image) */
  height?: number;
  /** File size in bytes */
  size?: number;
  /** Thumbnail URL */
  thumbnailUrl?: string;
}

/**
 * Selection information
 */
export interface SelectionInfo {
  /** Selected element IDs */
  elements: string[];
  /** Selected track IDs */
  tracks: string[];
  /** Time range selection */
  timeRange?: {
    start: number;
    end: number;
  };
}

/**
 * Timeline context interface
 */
export interface TimelineContext {
  /** Get timeline information */
  getTimelineInfo(): Promise<TimelineInfo>;

  /** Get all tracks */
  getTracks(): Promise<TrackInfo[]>;

  /** Get track by ID */
  getTrack(trackId: string): Promise<TrackInfo | undefined>;

  /** Get elements, optionally filtered by track */
  getElements(trackId?: string): Promise<ElementInfo[]>;

  /** Get element by ID */
  getElement(elementId: string): Promise<ElementInfo | undefined>;

  /** Add element to track */
  addElement(trackId: string, element: ElementInput): Promise<string>;

  /** Update element */
  updateElement(elementId: string, updates: Partial<ElementInput>): Promise<void>;

  /** Delete element */
  deleteElement(elementId: string): Promise<void>;

  /** Add new track */
  addTrack(type: TrackInfo['type'], name?: string): Promise<string>;

  /** Delete track */
  deleteTrack(trackId: string): Promise<void>;

  /** Set playhead position */
  setCurrentTime(time: number): Promise<void>;

  /** Get current playhead position */
  getCurrentTime(): Promise<number>;
}

/**
 * Media context interface
 */
export interface MediaContext {
  /** Get all media assets */
  getMediaList(): Promise<MediaInfo[]>;

  /** Get media by ID */
  getMedia(mediaId: string): Promise<MediaInfo | undefined>;

  /** Import media from path */
  importMedia(path: string): Promise<string>;

  /** Delete media asset */
  deleteMedia(mediaId: string): Promise<void>;

  /** Get media thumbnail */
  getThumbnail(mediaId: string): Promise<string | undefined>;

  /** Search media by name */
  searchMedia(query: string): Promise<MediaInfo[]>;
}

/**
 * Selection context interface
 */
export interface SelectionContext {
  /** Get current selection */
  getSelection(): Promise<SelectionInfo>;

  /** Set selected elements */
  selectElements(elementIds: string[]): Promise<void>;

  /** Add elements to selection */
  addToSelection(elementIds: string[]): Promise<void>;

  /** Remove elements from selection */
  removeFromSelection(elementIds: string[]): Promise<void>;

  /** Clear selection */
  clearSelection(): Promise<void>;

  /** Select time range */
  selectTimeRange(start: number, end: number): Promise<void>;
}

/**
 * Project context - unified interface for project state
 */
export interface ProjectContext extends TimelineContext, MediaContext, SelectionContext {
  /** Project ID */
  readonly projectId: string;

  /** Project name */
  readonly projectName: string;

  /** Whether project has unsaved changes */
  hasChanges(): Promise<boolean>;

  /** Save project */
  save(): Promise<void>;

  /** Undo last action */
  undo(): Promise<void>;

  /** Redo last undone action */
  redo(): Promise<void>;

  /** Check if undo is available */
  canUndo(): Promise<boolean>;

  /** Check if redo is available */
  canRedo(): Promise<boolean>;
}

/**
 * Project context event types
 */
export type ProjectContextEventType =
  | 'timeline:changed'
  | 'track:added'
  | 'track:removed'
  | 'track:updated'
  | 'element:added'
  | 'element:removed'
  | 'element:updated'
  | 'selection:changed'
  | 'media:imported'
  | 'media:removed'
  | 'playhead:moved';

/**
 * Project context event
 */
export interface ProjectContextEvent {
  type: ProjectContextEventType;
  data?: unknown;
}

/**
 * Project context listener
 */
export type ProjectContextListener = (event: ProjectContextEvent) => void;
