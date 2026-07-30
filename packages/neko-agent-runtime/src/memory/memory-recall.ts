/**
 * Memory Recall — Project-memory retrieval with relevance scoring
 *
 * Queries project memory sections, scores them by keyword overlap, and returns
 * the top-N items for prompt injection.
 */

import type { IProjectMemoryManager } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface MemoryRecallOptions {
  /** Project-scoped memory (.neko/memory.md) */
  projectMemory?: IProjectMemoryManager;
}

export interface RecalledMemory {
  /** Which layer the memory came from */
  source: 'project';
  /** Memory content */
  content: string;
  /** Relevance score 0-1 */
  relevance: number;
}

// =============================================================================
// Recall
// =============================================================================

/**
 * Project-memory recall with keyword-based relevance.
 *
 * Retrieval strategy:
 * 1. Parse `.neko/memory.md` into H2 sections
 * 2. Score each section by keyword overlap with the query
 * 3. Sort by relevance, return top-N
 */
export class MemoryRecall {
  private readonly _project: IProjectMemoryManager | undefined;

  constructor(options: MemoryRecallOptions) {
    this._project = options.projectMemory;
  }

  /**
   * Recall relevant memories from configured layers.
   *
   * @param query Search query (typically user input)
   * @param limit Max results to return (default: 5)
   */
  async recall(query: string, limit = 5): Promise<RecalledMemory[]> {
    if (!this._project) {
      return [];
    }

    const results: RecalledMemory[] = [];
    const resultsByContentKey = new Map<string, RecalledMemory>();
    const sections = this._parseMarkdownSections(this._project.getContent());
    for (const section of sections) {
      const content = this._normalizeSectionForRecall(section);
      const relevance = this._computeRelevance(query, content);
      if (relevance > 0.1) {
        const contentKey = this._computeContentDedupeKey(content);
        const existing = resultsByContentKey.get(contentKey);
        if (!existing || relevance > existing.relevance) {
          resultsByContentKey.set(contentKey, { source: 'project', content, relevance });
        }
      }
    }
    results.push(...resultsByContentKey.values());

    // Sort by relevance (descending), return top N
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute relevance score based on keyword overlap.
   *
   * @param query User query
   * @param content Memory content
   */
  private _computeRelevance(query: string, content: string): number {
    const queryWords = this._tokenize(query);
    const contentWords = this._tokenize(content);

    if (queryWords.length === 0 || contentWords.length === 0) return 0;

    // Keyword overlap ratio
    const contentSet = new Set(contentWords);
    let matches = 0;
    for (const word of queryWords) {
      if (contentSet.has(word)) matches++;
    }

    return matches / queryWords.length;
  }

  /** Simple tokenization: lowercase, split on whitespace/CJK boundaries */
  private _tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,;.!?，。！？；、]+/)
      .filter((w) => w.length > 1);
  }

  /** Parse markdown content into H2 sections (heading + body) */
  private _parseMarkdownSections(content: string | null): string[] {
    if (!content) return [];

    const sections: string[] = [];
    const lines = content.split('\n');
    let current: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (current.length > 0) {
          sections.push(current.join('\n').trim());
        }
        current = [line];
      } else if (current.length > 0) {
        current.push(line);
      }
    }

    if (current.length > 0) {
      sections.push(current.join('\n').trim());
    }

    return sections;
  }

  private _normalizeSectionForRecall(section: string): string {
    const lines = section.split('\n');
    const output: string[] = [];
    const seenListEntries = new Set<string>();
    let currentListEntry: string[] | null = null;

    const flushListEntry = () => {
      if (!currentListEntry) return;
      const key = this._normalizeTextForDedupe(currentListEntry.join('\n'));
      if (!seenListEntries.has(key)) {
        output.push(...currentListEntry);
        seenListEntries.add(key);
      }
      currentListEntry = null;
    };

    for (const line of lines) {
      if (line.startsWith('- ')) {
        flushListEntry();
        currentListEntry = [line];
        continue;
      }

      if (currentListEntry) {
        currentListEntry.push(line);
      } else {
        output.push(line);
      }
    }

    flushListEntry();
    return this._collapseExcessBlankLines(output.join('\n')).trim();
  }

  private _computeContentDedupeKey(content: string): string {
    const lines = content.split('\n');
    const body = lines[0]?.startsWith('## ') ? lines.slice(1).join('\n') : content;
    const keySource = body.trim() ? body : content;
    return this._normalizeTextForDedupe(keySource);
  }

  private _normalizeTextForDedupe(text: string): string {
    return text
      .toLowerCase()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private _collapseExcessBlankLines(text: string): string {
    return text.replace(/\n{3,}/g, '\n\n');
  }
}
