/**
 * Agent Memory Module
 *
 * Provides project memory, fact extraction, and recall for Agent execution.
 * Pi Session owns transcript context construction and compaction.
 */

// Project memory (cross-session file-backed memory)
export { FileProjectMemoryManager, createFileProjectMemoryManager } from './project-memory-manager';

// Memory recall (project memory only)
export { MemoryRecall } from './memory-recall';
export type { MemoryRecallOptions, RecalledMemory } from './memory-recall';

// Shared memory store (P5 — cross-ring scratchpad for dual-flow)
export {
  type ISharedMemoryStore,
  type SharedMemoryStoreConfig,
  type MemoryScope,
  type MemoryEntry,
  type MemoryListener,
} from './shared-memory-store';
