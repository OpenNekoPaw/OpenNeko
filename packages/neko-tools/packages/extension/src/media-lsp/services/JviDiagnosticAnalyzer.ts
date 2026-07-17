/**
 * JVI Diagnostic Analyzer — Pure diagnostic logic (no vscode dependency)
 *
 * Two categories of checks:
 * 1. checkStructure() — synchronous, structural/schema validation
 * 2. checkReferences() — asynchronous, file existence + probe-based validation
 */

import * as path from 'path';
import type { DiagnosticEntry, JviParsedProject, JviParsedElement } from '../types';
import type { ProbeResultLike } from './types';

// ─── Structural checks (sync) ───────────────────────────────────────────────

export function checkStructure(project: JviParsedProject): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];

  // 1. Invalid project values
  if (project.fps <= 0 && project.nameRange) {
    entries.push({
      message: `Invalid FPS value: ${project.fps}`,
      ...rangeToPos(project.nameRange),
      severity: 'error',
      code: 'invalid-fps',
    });
  }
  if ((project.resolution.width <= 0 || project.resolution.height <= 0) && project.nameRange) {
    entries.push({
      message: `Invalid resolution: ${project.resolution.width}x${project.resolution.height}`,
      ...rangeToPos(project.nameRange),
      severity: 'error',
      code: 'invalid-resolution',
    });
  }

  // 2. Duplicate track names
  const trackNames = new Map<string, number>();
  for (const track of project.tracks) {
    const prev = trackNames.get(track.name);
    if (prev !== undefined) {
      entries.push({
        message: `Duplicate track name "${track.name}"`,
        ...rangeToPos(track.nameRange),
        severity: 'warning',
        code: 'duplicate-track-name',
      });
    }
    trackNames.set(track.name, 1);
  }

  // 3. Collect all element IDs for cross-referencing
  const allElements = new Map<string, JviParsedElement>();
  const duplicateIds = new Set<string>();

  for (const track of project.tracks) {
    for (const el of track.elements) {
      if (allElements.has(el.id)) {
        duplicateIds.add(el.id);
      }
      allElements.set(el.id, el);
    }
  }

  // Report duplicate element IDs
  for (const track of project.tracks) {
    for (const el of track.elements) {
      if (duplicateIds.has(el.id)) {
        entries.push({
          message: `Duplicate element ID "${el.id}"`,
          ...rangeToPos(el.idRange),
          severity: 'error',
          code: 'duplicate-element-id',
        });
      }
    }
  }

  // 4. Broken linked element references
  for (const track of project.tracks) {
    for (const el of track.elements) {
      if (el.linkedAudioId && !allElements.has(el.linkedAudioId)) {
        entries.push({
          message: `Linked audio element "${el.linkedAudioId}" not found`,
          ...rangeToPos(el.linkedAudioIdRange ?? el.idRange),
          severity: 'error',
          code: 'broken-element-link',
        });
      }
      if (el.linkedVideoId && !allElements.has(el.linkedVideoId)) {
        entries.push({
          message: `Linked video element "${el.linkedVideoId}" not found`,
          ...rangeToPos(el.linkedVideoIdRange ?? el.idRange),
          severity: 'error',
          code: 'broken-element-link',
        });
      }
    }
  }

  // 5. Empty tracks
  for (const track of project.tracks) {
    if (track.elements.length === 0) {
      entries.push({
        message: `Track "${track.name}" has no elements`,
        ...rangeToPos(track.nameRange),
        severity: 'info',
        code: 'empty-track',
      });
    }
  }

  return entries;
}

// ─── Reference checks (async) ───────────────────────────────────────────────

export async function checkReferences(
  project: JviParsedProject,
  jviDir: string,
  fileExists: (absolutePath: string) => Promise<boolean>,
  probe: (absolutePath: string) => Promise<ProbeResultLike | null>,
  resolveSrc?: (jviDir: string, src: string) => Promise<string>,
): Promise<DiagnosticEntry[]> {
  const entries: DiagnosticEntry[] = [];
  const resolve =
    resolveSrc ?? ((dir: string, src: string) => Promise.resolve(path.resolve(dir, src)));

  // Collect all elements with src paths
  const srcElements: { el: JviParsedElement; absolutePath: string }[] = [];
  for (const track of project.tracks) {
    for (const el of track.elements) {
      if (el.src && el.srcRange) {
        const absolutePath = await resolve(jviDir, el.src);
        srcElements.push({ el, absolutePath });
      }
    }
  }

  // Check file existence in parallel
  const existenceResults = await Promise.all(
    srcElements.map(async ({ el, absolutePath }) => {
      const exists = await fileExists(absolutePath);
      return { el, absolutePath, exists };
    }),
  );

  for (const { el, absolutePath, exists } of existenceResults) {
    if (!exists && el.srcRange) {
      entries.push({
        message: `Media file not found: ${el.src}`,
        ...rangeToPos(el.srcRange),
        severity: 'error',
        code: 'missing-media-ref',
      });
    }
  }

  // Probe existing files for duration/resolution validation
  const existingFiles = existenceResults.filter((r) => r.exists);
  const probeResults = await Promise.all(
    existingFiles.map(async ({ el, absolutePath }) => {
      const result = await probe(absolutePath).catch(() => null);
      return { el, result };
    }),
  );

  for (const { el, result } of probeResults) {
    if (!result || !el.srcRange) continue;

    // Duration mismatch: element references more than source has
    if (
      result.duration > 0 &&
      el.duration > 0 &&
      el.duration > result.duration * 1.1 // 10% tolerance
    ) {
      entries.push({
        message: `Element duration (${el.duration.toFixed(1)}s) exceeds source duration (${result.duration.toFixed(1)}s)`,
        ...rangeToPos(el.srcRange),
        severity: 'warning',
        code: 'duration-mismatch',
      });
    }

    // Resolution hint: large difference from project resolution
    if (
      result.width > 0 &&
      result.height > 0 &&
      project.resolution.width > 0 &&
      project.resolution.height > 0
    ) {
      const scaleRatio = Math.max(
        result.width / project.resolution.width,
        project.resolution.width / result.width,
      );
      if (scaleRatio > 4) {
        entries.push({
          message: `Media resolution (${result.width}x${result.height}) differs significantly from project (${project.resolution.width}x${project.resolution.height})`,
          ...rangeToPos(el.srcRange),
          severity: 'info',
          code: 'resolution-mismatch',
        });
      }
    }
  }

  return entries;
}

// ─── Helpers ─��──────────────────────────────────────────────────────────────

function rangeToPos(range: {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}): { line: number; startChar: number; endChar: number } {
  return {
    line: range.startLine,
    startChar: range.startChar,
    endChar: range.endLine === range.startLine ? range.endChar : range.startChar + 40,
  };
}
