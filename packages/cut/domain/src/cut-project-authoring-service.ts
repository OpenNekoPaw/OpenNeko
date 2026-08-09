import {
  isContentFingerprint,
  normalizeWorkspaceContentPath,
  type AuthorizedWorkspaceWriter,
  type ContentFingerprint,
  type ContentReadService,
  type WorkspaceFileContentLocator,
} from '@neko/content';

import { parseOtio, serializeOtio } from './codec';
import { applyCutCommand, CutCommandError, type CutCommand } from './commands';
import { projectTimelineDocumentView, type TimelineDocumentView } from './projection';
import type { OtioTimeline } from './types';

const MAX_CUT_PROJECT_BYTES = 64 * 1024 * 1024;

export interface CutProjectSnapshot {
  readonly documentPath: string;
  readonly fingerprint: ContentFingerprint;
  readonly timeline: TimelineDocumentView;
}

export interface CutProjectAuthoringServiceOptions {
  readonly contentRead: ContentReadService;
  readonly workspaceWriter: AuthorizedWorkspaceWriter;
}

export class CutProjectAuthoringError extends Error {
  constructor(
    readonly code:
      | 'invalid-target'
      | 'read-failed'
      | 'invalid-document'
      | 'invalid-fingerprint'
      | 'stale-project'
      | 'invalid-command'
      | 'write-failed',
    message: string,
  ) {
    super(message);
    this.name = 'CutProjectAuthoringError';
  }
}

export class CutProjectAuthoringService {
  constructor(private readonly options: CutProjectAuthoringServiceOptions) {}

  async query(input: {
    readonly documentPath: string;
    readonly signal?: AbortSignal;
  }): Promise<CutProjectSnapshot> {
    const loaded = await this.readProject(input.documentPath, undefined, input.signal);
    return projectSnapshot(loaded.documentPath, loaded.fingerprint, loaded.document);
  }

  async apply(input: {
    readonly documentPath: string;
    readonly expectedFingerprint: ContentFingerprint;
    readonly commands: readonly CutCommand[];
    readonly signal?: AbortSignal;
  }): Promise<CutProjectSnapshot> {
    if (!isContentFingerprint(input.expectedFingerprint)) {
      throw new CutProjectAuthoringError(
        'invalid-fingerprint',
        'Cut authoring requires the exact fingerprint returned by a Cut query.',
      );
    }
    if (input.commands.length === 0) {
      throw new CutProjectAuthoringError(
        'invalid-command',
        'Cut authoring requires at least one command.',
      );
    }
    const current = await this.readProject(
      input.documentPath,
      input.expectedFingerprint,
      input.signal,
    );
    let document = current.document;
    try {
      for (const command of input.commands) document = applyCutCommand(document, command);
    } catch (error) {
      throw new CutProjectAuthoringError(
        'invalid-command',
        error instanceof CutCommandError || error instanceof Error
          ? error.message
          : 'Cut authoring command is invalid.',
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = serializeOtio(document);
    } catch (error) {
      throw new CutProjectAuthoringError(
        'invalid-document',
        error instanceof Error ? error.message : 'Cut document validation failed.',
      );
    }
    const written = await this.options.workspaceWriter.write(
      cutLocator(current.documentPath),
      bytes,
      {
        conflict: 'replace',
        expectedFingerprint: input.expectedFingerprint,
        maxBytes: MAX_CUT_PROJECT_BYTES,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
    if (written.status !== 'written') {
      throw new CutProjectAuthoringError(
        written.diagnostic.code === 'content-changed' ? 'stale-project' : 'write-failed',
        `Cut project write failed: ${written.diagnostic.code}.`,
      );
    }
    if (!written.fingerprint) {
      throw new CutProjectAuthoringError(
        'write-failed',
        'Cut project writer did not return durable freshness.',
      );
    }
    return projectSnapshot(current.documentPath, written.fingerprint, document);
  }

  private async readProject(
    documentPath: string,
    expectedFingerprint: ContentFingerprint | undefined,
    signal: AbortSignal | undefined,
  ): Promise<{
    readonly documentPath: string;
    readonly fingerprint: ContentFingerprint;
    readonly document: OtioTimeline;
  }> {
    const locator = cutLocator(documentPath);
    const result = await this.options.contentRead.read(locator, {
      maxBytes: MAX_CUT_PROJECT_BYTES,
      ...(expectedFingerprint ? { expectedFingerprint } : {}),
      ...(signal ? { signal } : {}),
    });
    if (result.status !== 'ready') {
      throw new CutProjectAuthoringError(
        result.diagnostic.code === 'content-changed' ? 'stale-project' : 'read-failed',
        `Cut project read failed: ${result.diagnostic.code}.`,
      );
    }
    const parsed = parseOtio(result.bytes);
    if (!parsed.ok) {
      throw new CutProjectAuthoringError(
        'invalid-document',
        `Cut project validation failed: ${parsed.diagnostics
          .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
          .join('; ')}.`,
      );
    }
    return {
      documentPath: locator.path,
      fingerprint: result.fingerprint,
      document: parsed.document,
    };
  }
}

function projectSnapshot(
  documentPath: string,
  fingerprint: ContentFingerprint,
  document: OtioTimeline,
): CutProjectSnapshot {
  return {
    documentPath,
    fingerprint,
    timeline: projectTimelineDocumentView({ document, documentUri: documentPath }),
  };
}

function cutLocator(documentPath: string): WorkspaceFileContentLocator {
  let normalized: string | undefined;
  try {
    normalized = normalizeWorkspaceContentPath(documentPath);
  } catch {
    throw new CutProjectAuthoringError(
      'invalid-target',
      'Cut project target must be a normalized Workspace-relative .otio path.',
    );
  }
  if (
    normalized === undefined ||
    normalized !== documentPath ||
    !normalized.toLowerCase().endsWith('.otio')
  ) {
    throw new CutProjectAuthoringError(
      'invalid-target',
      'Cut project target must be a normalized Workspace-relative .otio path.',
    );
  }
  return { kind: 'workspace-file', path: normalized };
}
