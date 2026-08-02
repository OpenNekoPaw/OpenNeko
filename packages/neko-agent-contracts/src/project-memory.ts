/**
 * Project Memory Types
 *
 * Defines the contract for persisting Agent-learned facts across sessions.
 * The backing store is `.neko/memory.md` in the project workspace root.
 *
 * Format: Markdown with H2 sections (## Section Name).
 * Each section is individually addressable via upsertEntry/removeEntry.
 */

// =============================================================================
// File I/O abstraction (injected to keep core logic testable)
// =============================================================================

export interface ProjectMemoryFileOps {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string) => Promise<void>;
}

// =============================================================================
// Manager interface
// =============================================================================

/**
 * Project-level persistent memory for the Agent.
 * Backed by `.neko/memory.md`; content is injected into the system prompt
 * at session start and refreshed in-session whenever entries change.
 */
export interface IProjectMemoryManager {
  /** Load content from file into the in-memory cache. */
  load(): Promise<void>;

  /** Return current cached content, or null if file does not exist. */
  getContent(): string | null;

  /**
   * Upsert a section under the given heading.
   * Creates the section if it does not exist; replaces it if it does.
   *
   * @param key   Section heading text (without `## ` prefix)
   * @param content  Body text for the section (may be multi-line Markdown)
   */
  upsertEntry(key: string, content: string): Promise<void>;

  /**
   * Remove the section with the given heading.
   * No-op if the section does not exist.
   */
  removeEntry(key: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // Change notification (simple listener pattern, no EventEmitter dependency)
  // ---------------------------------------------------------------------------

  /** Subscribe to content changes (fired after every upsert/remove). */
  on(event: 'change', listener: (content: string | null) => void): void;
  /** Unsubscribe a previously registered listener. */
  off(event: 'change', listener: (content: string | null) => void): void;
}
