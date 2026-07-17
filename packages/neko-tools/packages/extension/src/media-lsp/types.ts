/**
 * Media LSP — Pure data types (no vscode dependency)
 *
 * All types used by the diagnostic analyzer, parser, and workspace index.
 * Mirrors the pattern from neko-story's DiagnosticEntry.
 */

// ─── Diagnostic ──────────────────────────────────────────────────────────────

export interface DiagnosticEntry {
  readonly message: string;
  readonly line: number; // 0-based
  readonly startChar: number;
  readonly endChar: number;
  readonly severity: 'error' | 'warning' | 'info';
  readonly code?: string;
}

// ─── Position tracking ──────────────────────────────────────────────────────

/** Source range converted from jsonc-parser byte offsets */
export interface JviRange {
  readonly startLine: number; // 0-based
  readonly startChar: number;
  readonly endLine: number;
  readonly endChar: number;
}

// ─── Parsed JVI model (with position info) ──────────────────────────────────

export interface JviParsedProject {
  readonly name: string;
  readonly version: string;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly fps: number;
  readonly tracks: readonly JviParsedTrack[];
  readonly range: JviRange;
  readonly nameRange?: JviRange;
  readonly parseError?: string;
}

export interface JviParsedTrack {
  readonly id: string;
  readonly name: string;
  readonly trackType: string;
  readonly elements: readonly JviParsedElement[];
  readonly range: JviRange;
  readonly nameRange: JviRange;
}

export interface JviParsedElement {
  readonly id: string;
  readonly name: string;
  readonly type: 'media' | 'audio' | 'text' | 'shape' | 'subtitle';
  readonly src?: string;
  readonly srcRange?: JviRange;
  readonly duration: number;
  readonly startTime: number;
  readonly linkedAudioId?: string;
  readonly linkedAudioIdRange?: JviRange;
  readonly linkedVideoId?: string;
  readonly linkedVideoIdRange?: JviRange;
  readonly range: JviRange;
  readonly idRange: JviRange;
}

// ─── Cross-file reference (workspace index) ─────────────────────────────────

export interface MediaReference {
  readonly absolutePath: string;
  readonly relativeSrc: string;
  readonly jviUri: string;
  readonly elementId: string;
  readonly srcRange: JviRange;
}

export interface MediaSymbolLocation {
  readonly uri: string;
  readonly name: string;
  readonly kind: 'project' | 'track' | 'element';
  readonly range: JviRange;
  readonly detail?: string;
}
