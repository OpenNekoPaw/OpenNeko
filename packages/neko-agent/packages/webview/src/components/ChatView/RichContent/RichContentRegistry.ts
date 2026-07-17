/**
 * RichContentRegistry — Singleton map of content kind → renderer entry.
 *
 * Consumers call `registry.get(kind)` to look up the appropriate renderer.
 * New content types are added via `registry.register(entry)` — zero changes
 * needed in TaskCard or ToolCallDisplay (OCP).
 */

import type { RichContentRendererEntry } from './types';

class RichContentRegistryImpl {
  private readonly renderers = new Map<string, RichContentRendererEntry>();

  /** Register a renderer for a content kind. Last-write-wins if kind already registered. */
  register<T>(entry: RichContentRendererEntry<T>): void {
    this.renderers.set(entry.kind, entry as RichContentRendererEntry);
  }

  /** Look up a renderer by kind. Returns `undefined` if no renderer registered. */
  get(kind: string): RichContentRendererEntry | undefined {
    return this.renderers.get(kind);
  }

  /** Return all registered entries (e.g. for debug/introspection). */
  getAll(): RichContentRendererEntry[] {
    const entries: RichContentRendererEntry[] = [];
    this.renderers.forEach((entry) => entries.push(entry));
    return entries;
  }

  /** Check whether a renderer for the given kind exists. */
  has(kind: string): boolean {
    return this.renderers.has(kind);
  }
}

/** Module-level singleton — shared across the webview app */
export const richContentRegistry = new RichContentRegistryImpl();
