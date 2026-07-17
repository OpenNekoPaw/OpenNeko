/**
 * Context Persistence Types
 *
 * Defines types for persisting context state across sessions.
 */

import type { ContextLayer, ContextItem, ContextState } from './context-manager';

/**
 * Serializable context item (for persistence)
 */
export interface SerializableContextItem {
  id: string;
  layer: ContextLayer;
  type: 'prompt' | 'skill' | 'tool' | 'message' | 'reference' | 'index';
  content: string;
  tokenCount: number;
  priority: number;
  addedAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Serializable context state (for persistence)
 */
export interface SerializableContextState {
  /** Items by layer (as arrays for JSON serialization) */
  items: Record<ContextLayer, SerializableContextItem[]>;
  /** Token usage by layer */
  usage: Record<ContextLayer, number>;
  /** Active skills */
  activeSkills: string[];
  /** Active tool categories */
  activeToolCategories: string[];
  /** Turn counter */
  turnCount: number;
  /** Last compression timestamp */
  lastCompressionAt?: number;
  /** Session ID */
  sessionId: string;
  /** Timestamp when state was saved */
  savedAt: number;
  /** Version for migration */
  version: number;
}

/**
 * Context persistence configuration
 */
export interface ContextPersistenceConfig {
  /** Enable persistence */
  enabled: boolean;
  /** Storage key prefix */
  keyPrefix: string;
  /** Auto-save interval in milliseconds (0 = disabled) */
  autoSaveInterval: number;
  /** Maximum number of sessions to keep */
  maxSessions: number;
  /** Session expiry time in milliseconds */
  sessionExpiryMs: number;
  /** Layers to persist */
  persistLayers: ContextLayer[];
  /** Minimum priority to persist */
  minPriorityToPersist: number;
}

/**
 * Default persistence configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG: ContextPersistenceConfig = {
  enabled: true,
  keyPrefix: 'neko_context_',
  autoSaveInterval: 30000, // 30 seconds
  maxSessions: 10,
  sessionExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  persistLayers: ['permanent', 'session'],
  minPriorityToPersist: 3,
};

/**
 * Session metadata
 */
export interface SessionMetadata {
  /** Session ID */
  id: string;
  /** Session name/title */
  name?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Turn count */
  turnCount: number;
  /** Active skills at save time */
  activeSkills: string[];
  /** Total token usage */
  totalTokens: number;
  /** Whether session is complete */
  isComplete: boolean;
}

/**
 * Storage backend interface
 */
export interface IContextStorage {
  /**
   * Save context state
   */
  save(sessionId: string, state: SerializableContextState): Promise<void>;

  /**
   * Load context state
   */
  load(sessionId: string): Promise<SerializableContextState | null>;

  /**
   * Delete context state
   */
  delete(sessionId: string): Promise<void>;

  /**
   * List all session IDs
   */
  listSessions(): Promise<string[]>;

  /**
   * Get session metadata
   */
  getSessionMetadata(sessionId: string): Promise<SessionMetadata | null>;

  /**
   * Clear all sessions
   */
  clearAll(): Promise<void>;

  /**
   * Clean up expired sessions
   */
  cleanupExpired(expiryMs: number): Promise<number>;
}

/**
 * Context persistence manager interface
 */
export interface IContextPersistence {
  /**
   * Configure persistence
   */
  configure(config: Partial<ContextPersistenceConfig>): void;

  /**
   * Get current configuration
   */
  getConfig(): ContextPersistenceConfig;

  /**
   * Save current context state
   */
  save(state: ContextState, sessionId?: string): Promise<string>;

  /**
   * Load context state
   */
  load(sessionId: string): Promise<ContextState | null>;

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * List all sessions
   */
  listSessions(): Promise<SessionMetadata[]>;

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null;

  /**
   * Start a new session
   */
  startNewSession(name?: string): string;

  /**
   * Resume a session
   */
  resumeSession(sessionId: string): Promise<ContextState | null>;

  /**
   * Enable/disable auto-save
   */
  setAutoSave(enabled: boolean): void;

  /**
   * Clean up old sessions
   */
  cleanup(): Promise<number>;
}

/**
 * Convert ContextState to serializable format
 */
export function serializeContextState(
  state: ContextState,
  sessionId: string,
): SerializableContextState {
  const items: Record<ContextLayer, SerializableContextItem[]> = {
    permanent: [],
    session: [],
    turn: [],
    conversation: [],
  };

  for (const [layer, layerItems] of state.items) {
    items[layer] = layerItems.map((item) => ({
      id: item.id,
      layer: item.layer,
      type: item.type,
      content: item.content,
      tokenCount: item.tokenCount,
      priority: item.priority,
      addedAt: item.addedAt,
      lastAccessedAt: item.lastAccessedAt,
      metadata: item.metadata,
    }));
  }

  const usage: Record<ContextLayer, number> = {
    permanent: state.usage.get('permanent') ?? 0,
    session: state.usage.get('session') ?? 0,
    turn: state.usage.get('turn') ?? 0,
    conversation: state.usage.get('conversation') ?? 0,
  };

  return {
    items,
    usage,
    activeSkills: [...state.activeSkills],
    activeToolCategories: [...state.activeToolCategories],
    turnCount: state.turnCount,
    lastCompressionAt: state.lastCompressionAt,
    sessionId,
    savedAt: Date.now(),
    version: 1,
  };
}

/**
 * Convert serializable format back to ContextState
 */
export function deserializeContextState(serialized: SerializableContextState): ContextState {
  const items = new Map<ContextLayer, ContextItem[]>();
  const usage = new Map<ContextLayer, number>();

  for (const layer of ['permanent', 'session', 'turn', 'conversation'] as ContextLayer[]) {
    items.set(layer, serialized.items[layer] ?? []);
    usage.set(layer, serialized.usage[layer] ?? 0);
  }

  return {
    items,
    usage,
    activeSkills: [...serialized.activeSkills],
    activeToolCategories: [...serialized.activeToolCategories],
    turnCount: serialized.turnCount,
    lastCompressionAt: serialized.lastCompressionAt,
  };
}
