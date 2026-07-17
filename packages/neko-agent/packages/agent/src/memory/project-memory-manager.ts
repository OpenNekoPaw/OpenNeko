/**
 * Project Memory Manager
 *
 * File-backed implementation of IProjectMemoryManager.
 * Stores agent-learned facts in `.neko/memory.md` using H2 sections.
 *
 * Uses injected fs operations and debounced writes.
 */

import * as nodePath from 'node:path';
import * as nodeFs from 'node:fs/promises';
import type { IProjectMemoryManager, ProjectMemoryFileOps } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('ProjectMemoryManager');

// =============================================================================
// Section parsing helpers
// =============================================================================

/** Regex that matches an H2 heading line, capturing the heading text. */
const H2_REGEX = /^## (.+)$/m;

/**
 * Parse the markdown content into an ordered list of sections.
 * Each section is `{ key, body }` where body includes trailing newlines.
 */
function parseSections(content: string): Array<{ key: string; body: string }> {
  const lines = content.split('\n');
  const sections: Array<{ key: string; body: string }> = [];
  let currentKey: string | null = null;
  const currentLines: string[] = [];

  for (const line of lines) {
    const match = H2_REGEX.exec(line);
    if (match) {
      if (currentKey !== null) {
        sections.push({ key: currentKey, body: currentLines.join('\n') });
        currentLines.length = 0;
      }
      currentKey = match[1] ?? '';
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
    // Lines before first H2 are ignored (no preamble section support needed)
  }

  if (currentKey !== null) {
    sections.push({ key: currentKey, body: currentLines.join('\n') });
  }

  return sections;
}

/**
 * Serialise sections back to Markdown.
 * Each section: `## key\nbody`. Sections separated by blank line.
 */
function serializeSections(sections: Array<{ key: string; body: string }>): string {
  return sections
    .map(({ key, body }) => {
      // Normalise: trim trailing whitespace from body, ensure one trailing newline
      const trimmedBody = body.trimEnd();
      return trimmedBody.length > 0 ? `## ${key}\n${trimmedBody}` : `## ${key}`;
    })
    .join('\n\n');
}

// =============================================================================
// FileProjectMemoryManager
// =============================================================================

/**
 * File-backed project memory manager.
 * Use `createFileProjectMemoryManager()` to create an instance wired to Node.js fs.
 */
export class FileProjectMemoryManager implements IProjectMemoryManager {
  private _content: string | null = null;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _listeners: Array<(content: string | null) => void> = [];

  constructor(
    private readonly _filePath: string,
    private readonly _fileOps: ProjectMemoryFileOps,
  ) {}

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    try {
      const exists = await this._fileOps.exists(this._filePath);
      if (!exists) {
        this._content = null;
        return;
      }
      this._content = await this._fileOps.readFile(this._filePath);
    } catch (err) {
      logger.warn('Failed to load project memory file', { path: this._filePath, error: err });
      this._content = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  getContent(): string | null {
    return this._content;
  }

  // ---------------------------------------------------------------------------
  // Write — upsert / remove
  // ---------------------------------------------------------------------------

  async upsertEntry(key: string, content: string): Promise<void> {
    const sections = this._content ? parseSections(this._content) : [];
    const idx = sections.findIndex((s) => s.key === key);
    const entry = { key, body: '\n' + content };

    if (idx >= 0) {
      sections[idx] = entry;
    } else {
      sections.push(entry);
    }

    this._content = serializeSections(sections) + '\n';
    this._emitChange();
    await this._scheduleSave();
  }

  async removeEntry(key: string): Promise<void> {
    if (!this._content) return;

    const sections = parseSections(this._content);
    const filtered = sections.filter((s) => s.key !== key);
    if (filtered.length === sections.length) return; // Nothing removed

    this._content = filtered.length > 0 ? serializeSections(filtered) + '\n' : null;
    this._emitChange();
    if (this._content !== null) {
      await this._scheduleSave();
    } else {
      // File would be empty — skip writing (leave file as-is with stale content is acceptable)
      logger.debug('All sections removed from project memory');
    }
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  on(_event: 'change', listener: (content: string | null) => void): void {
    this._listeners.push(listener);
  }

  off(_event: 'change', listener: (content: string | null) => void): void {
    const idx = this._listeners.indexOf(listener);
    if (idx >= 0) this._listeners.splice(idx, 1);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _emitChange(): void {
    for (const listener of this._listeners) {
      try {
        listener(this._content);
      } catch (err) {
        logger.warn('Project memory change listener threw', { error: err });
      }
    }
  }

  private async _scheduleSave(): Promise<void> {
    // Flush immediately (no debounce needed — writes are infrequent)
    await this._flush();
  }

  private async _flush(): Promise<void> {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._content === null) return;

    try {
      const dir = nodePath.dirname(this._filePath);
      await this._fileOps.mkdir(dir);
      await this._fileOps.writeFile(this._filePath, this._content);
      logger.debug('Project memory saved', { path: this._filePath });
    } catch (err) {
      logger.error('Failed to save project memory', { path: this._filePath, error: err });
    }
  }
}

// =============================================================================
// Factory for Node.js environments (TUI + Extension Host)
// =============================================================================

/**
 * Create a FileProjectMemoryManager wired to Node.js `fs/promises`.
 * Works in both TUI (CLI) and Extension Host (Node.js runtime).
 *
 * @param filePath Absolute path to the memory file (e.g. `workDir/.neko/memory.md`)
 */
export function createFileProjectMemoryManager(filePath: string): FileProjectMemoryManager {
  const fileOps: ProjectMemoryFileOps = {
    readFile: (p) => nodeFs.readFile(p, 'utf-8'),
    writeFile: (p, content) => nodeFs.writeFile(p, content, 'utf-8'),
    exists: async (p) => {
      try {
        await nodeFs.access(p);
        return true;
      } catch {
        return false;
      }
    },
    mkdir: (p) => nodeFs.mkdir(p, { recursive: true }).then(() => undefined),
  };

  return new FileProjectMemoryManager(filePath, fileOps);
}
