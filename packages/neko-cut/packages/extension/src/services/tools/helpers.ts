/**
 * Pure helper functions for timeline tool operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  applyPortableSourcePathPolicy,
  contractWorkspaceMediaPath,
  nkvSourcePathPolicy,
  type ProjectData,
  type TimelineElement,
  type TimelineTrack,
  type WorkspaceMediaPathContext,
} from '@neko/shared';
import {
  contractHostContentMediaPath,
  resolveHostContentMediaPath,
  type HostContentPathResolverOptions,
} from '@neko/shared/vscode/extension';

// =============================================================================
// Tool Element Types
// =============================================================================

/**
 * Runtime element shape as seen by tool handlers.
 *
 * ProjectData from the webview stores EditorElement objects which carry
 * UI extension fields (animTransform, colorCorrection, masks, etc.) alongside
 * engine-aligned TimelineElement fields. This type makes those runtime
 * fields visible to handlers without importing webview-internal types.
 */
export interface ToolElementExtensions {
  /** Animatable transform tracks (UI-only, pending engine support) */
  animTransform?: Record<string, unknown>;
  /** Color correction settings (UI-only, not engine field) */
  colorCorrection?: Record<string, unknown>;
  /** Mask instances (UI-only, pending engine support) */
  masks?: Array<Record<string, unknown>>;
}

/** TimelineElement with optional UI extension fields visible at runtime */
export type ToolElement = TimelineElement & Partial<ToolElementExtensions>;

/**
 * Runtime track shape as seen by tool handlers.
 * Tracks may carry UI extension fields like shapes.
 */
export interface ToolTrackExtensions {
  /** Shape instances on the track (UI-only) */
  shapes?: Array<Record<string, unknown>>;
}

/** TimelineTrack with optional UI extension fields visible at runtime */
export type ToolTrack = TimelineTrack & Partial<ToolTrackExtensions>;

// =============================================================================
// Element Utilities
// =============================================================================

/**
 * Merge updates into an element, returning a TimelineElement.
 * Centralizes the spread+cast pattern that TS requires when updating
 * discriminated union members (spread loses the discriminant tag).
 */
export function mergeElement(base: ToolElement, updates: Record<string, unknown>): TimelineElement {
  return { ...base, ...updates } as TimelineElement;
}

/**
 * Create a TimelineElement from a partial object literal.
 * Used by AddElement where the handler constructs a new element
 * with only the fields relevant to its type.
 */
export function createElement(fields: Record<string, unknown>): TimelineElement {
  return fields as unknown as TimelineElement;
}

// =============================================================================
// Portable Path Utilities (PathVariable integration)
// =============================================================================

export interface CutMediaPathContextOptions {
  readonly projectFilePath?: string;
  readonly documentUri?: vscode.Uri;
  readonly owningWorkspaceRoot?: string;
  readonly workspaceRoots?: readonly string[];
  readonly allowedRoots?: readonly string[];
  readonly fileExists?: (filePath: string) => boolean;
}

/**
 * Contract an absolute path to a portable path for storage.
 *
 * Priority:
 * 1. PathVariable: /Volumes/NAS/footage/clip.mp4 → ${FOOTAGE}/clip.mp4
 * 2. Workspace-relative: /project/assets/clip.mp4 → assets/clip.mp4
 */
async function contractPath(
  absolutePath: string,
  baseDir: string,
  options: CutMediaPathContextOptions = {},
): Promise<string | undefined> {
  const context = createCutWorkspaceMediaPathContext(baseDir, options);
  const contractedByPolicy = await contractHostContentMediaPath(
    absolutePath,
    createHostContentPathOptions(context, options),
  );
  if (contractedByPolicy && !path.isAbsolute(contractedByPolicy)) return contractedByPolicy;

  const contracted = contractWorkspaceMediaPath(absolutePath, context);
  if (
    contracted.format === 'workspace-relative' ||
    contracted.format === 'variable' ||
    contracted.format === 'remote-url'
  ) {
    return contracted.path;
  }

  return undefined;
}

/**
 * Resolve a stored path (PathVariable or relative) to an absolute path.
 *
 * Uses the shared host content policy and fails visibly when no authorized
 * local candidate exists.
 */
export async function resolveMediaPath(
  storedPath: string,
  baseDir: string,
  options: CutMediaPathContextOptions = {},
): Promise<string> {
  const context = createCutWorkspaceMediaPathContext(baseDir, options);
  return resolveHostContentMediaPath(storedPath, createHostContentPathOptions(context, options));
}

export function toRelativeIfAbsolute(filePath: string, baseDir: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}

/**
 * Normalize all element paths in a project for saving.
 *
 * Converts absolute paths to portable paths:
 * - External paths → ${VAR}/rest (via PathResolver)
 * - Project-internal paths → relative to project dir
 */
export async function normalizePathsForSave(
  project: ProjectData,
  projectFilePath?: string,
  options: CutMediaPathContextOptions = {},
): Promise<ProjectData> {
  if (!projectFilePath) return project;

  const baseDir = path.dirname(projectFilePath);
  const contextOptions = { ...options, projectFilePath };
  const context = createCutWorkspaceMediaPathContext(baseDir, contextOptions);
  const precontracted = await contractSourcesWithAssetCommand(project, baseDir, contextOptions);
  const result = applyPortableSourcePathPolicy(precontracted, nkvSourcePathPolicy, { context });

  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error(
      `Unable to normalize NKV media paths: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }

  return result.document;
}

async function contractSourcesWithAssetCommand(
  project: ProjectData,
  baseDir: string,
  options: CutMediaPathContextOptions,
): Promise<ProjectData> {
  const replacements = await Promise.all(
    nkvSourcePathPolicy
      .listSources(project)
      .filter((descriptor) => path.isAbsolute(descriptor.path))
      .map(async (descriptor) => {
        const contracted = await contractPath(descriptor.path, baseDir, options);
        return contracted ? { descriptor, path: contracted } : undefined;
      }),
  );
  const compact = replacements.filter(
    (replacement): replacement is NonNullable<(typeof replacements)[number]> =>
      replacement !== undefined,
  );
  return compact.length > 0 ? nkvSourcePathPolicy.replaceSources(project, compact) : project;
}

export async function resolveProjectMediaSourcesForRuntime(
  project: ProjectData,
  projectFilePath: string,
  options: CutMediaPathContextOptions = {},
): Promise<ProjectData> {
  const baseDir = path.dirname(projectFilePath);
  const contextOptions = { ...options, projectFilePath };

  const tracks = await Promise.all(
    project.tracks.map(async (track) => ({
      ...track,
      elements: await Promise.all(
        track.elements.map(async (element) => {
          if (
            (element.type === 'media' ||
              element.type === 'audio' ||
              element.type === 'scene3d' ||
              element.type === 'puppet') &&
            typeof element.src === 'string' &&
            !isRemoteUrl(element.src)
          ) {
            const resolved = await resolveMediaPath(element.src, baseDir, contextOptions);
            return { ...element, src: resolved } as TimelineElement;
          }
          return element;
        }),
      ),
    })),
  );

  return { ...project, tracks };
}

export function createCutWorkspaceMediaPathContext(
  baseDir: string,
  options: CutMediaPathContextOptions = {},
): WorkspaceMediaPathContext {
  const documentPath = options.projectFilePath ?? options.documentUri?.fsPath;
  const documentDir = documentPath ? path.dirname(documentPath) : baseDir;
  const workspaceRoots =
    options.workspaceRoots ??
    vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ??
    [];
  const owningWorkspaceRoot =
    options.owningWorkspaceRoot ??
    findOwningWorkspaceRoot(documentPath ?? documentDir, workspaceRoots) ??
    documentDir;
  const pathVariables = new Map<string, string>();
  if (owningWorkspaceRoot) {
    pathVariables.set('WORKSPACE', owningWorkspaceRoot);
    pathVariables.set('PROJECT', owningWorkspaceRoot);
  }
  const allowedRoots = uniquePaths([
    ...(options.allowedRoots ?? []),
    ...workspaceRoots,
    ...(documentDir ? [documentDir] : []),
  ]);

  return {
    ...(options.documentUri ? { sourceDocumentUri: options.documentUri.toString() } : {}),
    ...(owningWorkspaceRoot ? { owningWorkspaceRoot } : {}),
    workspaceRoots,
    documentDir,
    pathVariables,
    allowedRoots,
  };
}

function createHostContentPathOptions(
  context: WorkspaceMediaPathContext,
  options: CutMediaPathContextOptions,
): HostContentPathResolverOptions {
  return {
    ...(context.owningWorkspaceRoot ? { workspaceRoot: context.owningWorkspaceRoot } : {}),
    ...(options.documentUri ? { documentUri: options.documentUri } : {}),
    workspaceFolders: vscode.workspace.workspaceFolders ?? [],
    allowedRoots: context.allowedRoots,
    fileExists: options.fileExists ?? isExistingLocalFile,
    getExtension: vscode.extensions.getExtension,
  };
}

function findOwningWorkspaceRoot(
  documentPath: string | undefined,
  workspaceRoots: readonly string[],
): string | undefined {
  if (!documentPath) return undefined;
  return workspaceRoots
    .filter((root) => isPathInsideOrEqual(documentPath, root))
    .sort((left, right) => right.length - left.length)[0];
}

export function isExistingLocalFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isRemoteUrl(source: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(source) && !/^[A-Za-z]:[\\/]/.test(source);
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(Boolean).map((value) => path.normalize(value)))];
}

export function findElement(
  project: ProjectData,
  elementId: string,
): {
  trackIndex: number;
  elementIndex: number;
  track: ToolTrack;
  element: ToolElement;
} | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const track = project.tracks[trackIndex];
    if (!track) continue;
    const elementIndex = track.elements.findIndex((e) => e.id === elementId);
    if (elementIndex !== -1) {
      const element = track.elements[elementIndex];
      if (!element) continue;
      return {
        trackIndex,
        elementIndex,
        track: track as ToolTrack,
        element: element as ToolElement,
      };
    }
  }
  return null;
}

export function updateElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
  updatedElement: TimelineElement,
): ProjectData {
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track index out of bounds: ${trackIndex}`);
  const updatedElements = [...track.elements];
  updatedElements[elementIndex] = updatedElement;
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

export function removeElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
): ProjectData {
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track index out of bounds: ${trackIndex}`);
  const updatedElements = [...track.elements];
  updatedElements.splice(elementIndex, 1);
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

export function normalizePercent(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}
