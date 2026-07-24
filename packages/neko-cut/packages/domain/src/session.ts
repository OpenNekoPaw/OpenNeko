import { applyCutCommand, CutCommandError, type CutCommand } from './commands';
import { assignMissingClipIds, assignMissingTrackIds } from './document';
import { parseOtio, serializeOtio } from './codec';
import { projectTimelineView, type TimelineView } from './projection';
import type { CutClipIdFactory, CutTrackIdFactory, OtioTimeline } from './types';

export interface CutStoredDocument {
  readonly bytes: Uint8Array;
  readonly version: string;
}

export interface CutDocumentStorage {
  read(documentUri: string): Promise<CutStoredDocument>;
  write(
    documentUri: string,
    bytes: Uint8Array,
    options: { readonly expectedVersion?: string },
  ): Promise<{ readonly version: string }>;
}

export interface CutDocumentSessionIdentity {
  readonly documentUri: string;
  readonly sessionId: string;
}

export interface CutDocumentCommandRequest extends CutDocumentSessionIdentity {
  readonly expectedRevision: number;
  readonly command: CutCommand;
}

export interface CutDocumentBatchRequest extends CutDocumentSessionIdentity {
  readonly expectedRevision: number;
  readonly commands: readonly CutCommand[];
}

export interface CutDocumentSessionOptions {
  readonly storage: CutDocumentStorage;
  readonly createClipId: CutClipIdFactory;
  readonly createTrackId: CutTrackIdFactory;
  readonly createSessionId: () => string;
}

export class CutDocumentSessionError extends Error {
  readonly code:
    | 'document-mismatch'
    | 'session-mismatch'
    | 'stale-revision'
    | 'external-change-conflict'
    | 'invalid-document';

  constructor(code: CutDocumentSessionError['code'], message: string) {
    super(message);
    this.name = 'CutDocumentSessionError';
    this.code = code;
  }
}

export class CutDocumentSession {
  private document: OtioTimeline;
  private revisionValue = 0;
  private storageVersion?: string;
  private dirtyValue: boolean;
  private undoStack: OtioTimeline[] = [];
  private redoStack: OtioTimeline[] = [];
  private readonly storage: CutDocumentStorage;
  private readonly createClipId: CutClipIdFactory;
  private readonly createTrackId: CutTrackIdFactory;

  readonly sessionId: string;
  documentUri: string;

  private constructor(input: {
    readonly document: OtioTimeline;
    readonly documentUri: string;
    readonly storageVersion?: string;
    readonly dirty: boolean;
    readonly options: CutDocumentSessionOptions;
  }) {
    this.document = input.document;
    this.documentUri = input.documentUri;
    this.storageVersion = input.storageVersion;
    this.dirtyValue = input.dirty;
    this.storage = input.options.storage;
    this.createClipId = input.options.createClipId;
    this.createTrackId = input.options.createTrackId;
    this.sessionId = input.options.createSessionId();
  }

  static async open(
    documentUri: string,
    options: CutDocumentSessionOptions,
  ): Promise<CutDocumentSession> {
    const stored = await options.storage.read(documentUri);
    const parsed = parseOtio(stored.bytes);
    if (!parsed.ok) {
      throw new CutDocumentSessionError(
        'invalid-document',
        `Cannot open OTIO: ${parsed.diagnostics.map((item) => `${item.path}: ${item.message}`).join('; ')}`,
      );
    }
    const normalizedTracks = assignMissingTrackIds(parsed.document, options.createTrackId);
    const normalized = assignMissingClipIds(normalizedTracks.document, options.createClipId);
    return new CutDocumentSession({
      document: normalized.document,
      documentUri,
      storageVersion: stored.version,
      dirty: normalizedTracks.changed || normalized.changed,
      options,
    });
  }

  static create(
    documentUri: string,
    document: OtioTimeline,
    options: CutDocumentSessionOptions,
  ): CutDocumentSession {
    const normalizedTracks = assignMissingTrackIds(document, options.createTrackId);
    const normalized = assignMissingClipIds(normalizedTracks.document, options.createClipId);
    return new CutDocumentSession({
      document: normalized.document,
      documentUri,
      dirty: true,
      options,
    });
  }

  get revision(): number {
    return this.revisionValue;
  }

  get dirty(): boolean {
    return this.dirtyValue;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  view(): TimelineView {
    return projectTimelineView({
      document: this.document,
      documentUri: this.documentUri,
      sessionId: this.sessionId,
      revision: this.revisionValue,
    });
  }

  apply(request: CutDocumentCommandRequest): TimelineView {
    return this.applyBatch({
      documentUri: request.documentUri,
      sessionId: request.sessionId,
      expectedRevision: request.expectedRevision,
      commands: [request.command],
    });
  }

  applyBatch(request: CutDocumentBatchRequest): TimelineView {
    this.assertIdentity(request);
    if (request.commands.length === 0) {
      throw new CutCommandError('invalid-command', 'Cut command batch cannot be empty.');
    }
    let next = this.document;
    for (const command of request.commands) {
      next = applyCutCommand(next, command);
    }
    serializeOtio(next);
    this.undoStack.push(this.document);
    this.redoStack = [];
    this.document = next;
    this.revisionValue += 1;
    this.dirtyValue = true;
    return this.view();
  }

  undo(identity: CutDocumentSessionIdentity & { readonly expectedRevision: number }): TimelineView {
    this.assertIdentity(identity);
    const previous = this.undoStack.pop();
    if (!previous) return this.view();
    this.redoStack.push(this.document);
    this.document = previous;
    this.revisionValue += 1;
    this.dirtyValue = true;
    return this.view();
  }

  redo(identity: CutDocumentSessionIdentity & { readonly expectedRevision: number }): TimelineView {
    this.assertIdentity(identity);
    const next = this.redoStack.pop();
    if (!next) return this.view();
    this.undoStack.push(this.document);
    this.document = next;
    this.revisionValue += 1;
    this.dirtyValue = true;
    return this.view();
  }

  async save(): Promise<void> {
    const result = await this.storage.write(this.documentUri, serializeOtio(this.document), {
      ...(this.storageVersion ? { expectedVersion: this.storageVersion } : {}),
    });
    this.storageVersion = result.version;
    this.dirtyValue = false;
  }

  async saveAs(input: {
    readonly documentUri: string;
    readonly rebase: (
      document: OtioTimeline,
      oldUri: string,
      newUri: string,
    ) => OtioTimeline | Promise<OtioTimeline>;
  }): Promise<void> {
    const rebased = await input.rebase(this.document, this.documentUri, input.documentUri);
    const result = await this.storage.write(input.documentUri, serializeOtio(rebased), {});
    this.document = rebased;
    this.documentUri = input.documentUri;
    this.storageVersion = result.version;
    this.revisionValue += 1;
    this.dirtyValue = false;
    this.undoStack = [];
    this.redoStack = [];
  }

  async backup(backupUri: string): Promise<void> {
    await this.storage.write(backupUri, serializeOtio(this.document), {});
  }

  async revert(): Promise<TimelineView> {
    const stored = await this.storage.read(this.documentUri);
    const parsed = parseOtio(stored.bytes);
    if (!parsed.ok) {
      throw new CutDocumentSessionError('invalid-document', 'Cannot revert to invalid OTIO bytes.');
    }
    this.document = assignMissingClipIds(
      assignMissingTrackIds(parsed.document, this.createTrackId).document,
      this.createClipId,
    ).document;
    this.storageVersion = stored.version;
    this.revisionValue += 1;
    this.dirtyValue = false;
    this.undoStack = [];
    this.redoStack = [];
    return this.view();
  }

  async acceptExternalChange(version: string): Promise<TimelineView> {
    if (version === this.storageVersion) return this.view();
    if (this.dirtyValue) {
      throw new CutDocumentSessionError(
        'external-change-conflict',
        'The OTIO file changed externally while this session has unsaved edits.',
      );
    }
    return this.revert();
  }

  private assertIdentity(
    identity: CutDocumentSessionIdentity & { readonly expectedRevision: number },
  ): void {
    if (identity.documentUri !== this.documentUri) {
      throw new CutDocumentSessionError('document-mismatch', 'Command targets another document.');
    }
    if (identity.sessionId !== this.sessionId) {
      throw new CutDocumentSessionError('session-mismatch', 'Command targets another session.');
    }
    if (identity.expectedRevision !== this.revisionValue) {
      throw new CutDocumentSessionError(
        'stale-revision',
        `Expected revision ${this.revisionValue}; received ${identity.expectedRevision}.`,
      );
    }
  }
}
