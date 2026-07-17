/**
 * Context Manager Types
 *
 * Defines types for managing context lifecycle and token budgets
 * across different context layers (permanent, session, turn, conversation).
 */

/**
 * Context layer types
 * - permanent: Always retained (global prompt, core tools, indexes)
 * - session: Session-level (active skills, tool categories)
 * - turn: Turn-level, can be discarded (on-demand tools, temp references)
 * - conversation: Conversation history
 */
export type ContextLayer = 'permanent' | 'session' | 'turn' | 'conversation';

/**
 * Token budget configuration for each layer
 */
export interface ContextBudget {
  /** Total token budget (e.g., 100K) */
  total: number;
  /** Permanent layer budget (e.g., 10K) */
  permanent: number;
  /** Session layer budget (e.g., 20K) */
  session: number;
  /** Turn layer budget (e.g., 15K) */
  turn: number;
  /** Conversation history budget (e.g., 55K) */
  conversation: number;
}

/**
 * Token usage for a single layer
 */
export interface LayerUsage {
  /** Layer type */
  layer: ContextLayer;
  /** Tokens used */
  used: number;
  /** Token budget */
  budget: number;
  /** Percentage used */
  percentage: number;
}

/**
 * Context item with metadata
 */
export interface ContextItem {
  /** Unique identifier */
  id: string;
  /** Layer this item belongs to */
  layer: ContextLayer;
  /** Content type */
  type: 'prompt' | 'skill' | 'tool' | 'message' | 'reference' | 'index';
  /** Actual content */
  content: string;
  /** Estimated token count */
  tokenCount: number;
  /** Priority (higher = more important to keep) */
  priority: number;
  /** Timestamp when added */
  addedAt: number;
  /** Last accessed timestamp */
  lastAccessedAt: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context state snapshot
 */
export interface ContextState {
  /** Items by layer */
  items: Map<ContextLayer, ContextItem[]>;
  /** Token usage by layer */
  usage: Map<ContextLayer, number>;
  /** Active skills */
  activeSkills: string[];
  /** Active tool categories */
  activeToolCategories: string[];
  /** Turn counter */
  turnCount: number;
  /** Last compression timestamp */
  lastCompressionAt?: number;
}

/**
 * Context overflow event
 */
export interface ContextOverflowEvent {
  /** Layer that overflowed */
  layer: ContextLayer;
  /** Current usage */
  used: number;
  /** Budget */
  budget: number;
  /** Items that could be evicted */
  evictionCandidates: ContextItem[];
}

/**
 * Layered context manager configuration
 */
export interface LayeredContextManagerConfig {
  /** Token budget allocation */
  budget: ContextBudget;
  /** Token threshold to trigger compression (percentage, e.g., 0.8 = 80%) */
  compressionThreshold: number;
  /** Turn threshold to trigger compression */
  turnCompressionThreshold: number;
  /** Maximum active skills */
  maxActiveSkills: number;
  /** Skill inactivity threshold (turns without use before deactivation) */
  skillInactivityThreshold: number;
  /** Enable automatic compression */
  autoCompress: boolean;
}

/**
 * Default layered context manager configuration
 */
export const DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG: LayeredContextManagerConfig = {
  budget: {
    total: 100000,
    permanent: 10000,
    session: 20000,
    turn: 15000,
    conversation: 55000,
  },
  compressionThreshold: 0.8,
  turnCompressionThreshold: 20,
  maxActiveSkills: 3,
  skillInactivityThreshold: 5,
  autoCompress: true,
};

/**
 * Context event types
 */
export type ContextEventType =
  | 'item_added'
  | 'item_removed'
  | 'item_accessed'
  | 'layer_overflow'
  | 'compression_triggered'
  | 'compression_completed'
  | 'skill_activated'
  | 'skill_deactivated'
  | 'turn_started'
  | 'turn_ended'
  | 'state_reset';

/**
 * Context event
 */
export interface ContextEvent {
  /** Event type */
  type: ContextEventType;
  /** Timestamp */
  timestamp: number;
  /** Layer affected */
  layer?: ContextLayer;
  /** Item affected */
  item?: ContextItem;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Context event listener
 */
export type ContextEventListener = (event: ContextEvent) => void;

/**
 * Layered context manager interface
 */
export interface ILayeredContextManager {
  /**
   * Configure the context manager
   */
  configure(config: Partial<LayeredContextManagerConfig>): void;

  /**
   * Get current configuration
   */
  getConfig(): LayeredContextManagerConfig;

  /**
   * Get current context state
   */
  getState(): ContextState;

  /**
   * Add an item to a layer
   */
  addItem(item: Omit<ContextItem, 'addedAt' | 'lastAccessedAt'>): void;

  /**
   * Remove an item by ID
   */
  removeItem(id: string): void;

  /**
   * Access an item (updates lastAccessedAt)
   */
  accessItem(id: string): ContextItem | undefined;

  /**
   * Get items by layer
   */
  getItemsByLayer(layer: ContextLayer): ContextItem[];

  /**
   * Get token usage summary
   */
  getUsage(): LayerUsage[];

  /**
   * Get total token usage
   */
  getTotalUsage(): number;

  /**
   * Check if a layer is over budget
   */
  isOverBudget(layer: ContextLayer): boolean;

  /**
   * Check if total usage exceeds threshold
   */
  shouldCompress(): boolean;

  /**
   * Trigger compression
   */
  compress(): Promise<void>;

  /**
   * Called at turn start
   */
  onTurnStart(): void;

  /**
   * Called at turn end
   */
  onTurnEnd(): void;

  /**
   * Activate a skill
   */
  activateSkill(skillId: string): void;

  /**
   * Deactivate a skill
   */
  deactivateSkill(skillId: string): void;

  /**
   * Get active skills
   */
  getActiveSkills(): string[];

  /**
   * Reset context state
   */
  reset(): void;

  /**
   * Add event listener
   */
  addEventListener(listener: ContextEventListener): () => void;
}
