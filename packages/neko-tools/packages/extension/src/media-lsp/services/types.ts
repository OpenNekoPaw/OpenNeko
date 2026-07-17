/**
 * Media LSP — Service interfaces
 *
 * All abstractions for diagnostic analysis, probe caching, and workspace indexing.
 * Implementations are in sibling files; providers depend only on these interfaces.
 */

import type * as vscode from 'vscode';
import type {
  DiagnosticEntry,
  JviParsedProject,
  JviParsedElement,
  JviRange,
  MediaReference,
  MediaSymbolLocation,
} from '../types';

// ─── Probe result (minimal shape from EngineClient) ─────────────────────────

/** Subset of EngineClient ProbeResult needed by diagnostics */
export interface ProbeResultLike {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly format: string;
  readonly bitrate?: number;
  readonly hasAudio: boolean;
  readonly audioCodec?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
  readonly audioBitrate?: number;
}

// ─── JVI Diagnostic Analyzer ────────────────────────────────────────────────

export interface IJviDiagnosticAnalyzer {
  /** Synchronous structural checks (no I/O) */
  analyzeStructure(project: JviParsedProject): DiagnosticEntry[];

  /** Asynchronous reference checks (file existence + probe) */
  analyzeReferences(
    project: JviParsedProject,
    jviDir: string,
    fileExists: (absolutePath: string) => Promise<boolean>,
    probe: (absolutePath: string) => Promise<ProbeResultLike | null>,
  ): Promise<DiagnosticEntry[]>;
}

// ─── Media Probe Cache ──────────────────────────────────────────────────────

export interface IMediaProbeCache {
  get(absolutePath: string): ProbeResultLike | undefined;
  set(absolutePath: string, result: ProbeResultLike): void;
  invalidate(absolutePath: string): void;
  clear(): void;
}

// ─── Workspace Index (Phase 2) ──────────────────────────────────────────────

export interface IMediaWorkspaceIndex extends vscode.Disposable {
  ensureInitialized(): Promise<void>;

  /** Returns the cached parsed project for a JVI URI, or undefined */
  getDocument(uriStr: string): JviParsedProject | undefined;

  /** Finds all JVI elements referencing a given absolute media path */
  findMediaReferences(absoluteMediaPath: string): readonly MediaReference[];

  /** Finds an element by ID across all indexed JVI files */
  findElementById(
    elementId: string,
  ): { jviUri: string; element: JviParsedElement; range: JviRange } | undefined;

  /** Fuzzy search all indexed symbols */
  searchSymbols(query: string): readonly MediaSymbolLocation[];
}
