/**
 * Agent Memory Module
 *
 * Provides process-local scratch state for Agent execution.
 */

// Shared memory store (P5 — cross-ring scratchpad for dual-flow)
export {
  type ISharedMemoryStore,
  type SharedMemoryStoreConfig,
  type MemoryScope,
  type MemoryEntry,
  type MemoryListener,
} from './shared-memory-store';
