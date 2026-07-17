/**
 * Memory Types - shared fact primitives
 */

/**
 * Key fact extracted from conversation
 */
export interface KeyFact {
  /** Fact content */
  content: string;
  /** Fact category */
  category: 'preference' | 'decision' | 'context' | 'action';
  /** Extraction timestamp */
  timestamp: number;
  /** Confidence score 0-1 */
  confidence: number;
}
