import {
  contentLocatorsEqual,
  type AuthorizedWorkspaceWriter,
  type ContentFingerprint,
  type ContentReadService,
} from '@neko/content';
import { parseFountainDocument } from '@neko/screenplay-domain';
import { admitTextDocument, encodeTextDocument } from './admission';
import {
  TextDocumentError,
  type ApplyTextDocumentEditsCommand,
  type TextDocumentChange,
  type TextDocumentCloseDecision,
  type TextDocumentDiagnostic,
  type TextDocumentIdentity,
  type TextDocumentMode,
  type TextDocumentProjection,
} from './contracts';

export interface TextDocumentSessionDependencies {
  readonly reader: ContentReadService;
  readonly writer: AuthorizedWorkspaceWriter;
  readonly createSessionId?: () => string;
}

export class TextDocumentSession {
  private editSequence = 0;
  private source: string;
  private baseSource: string;
  private baseFingerprint: ContentFingerprint;
  private readonly mode: TextDocumentMode;
  private lineEnding: '\n' | '\r\n';
  private hasBom: boolean;
  private readonly requests = new Set<string>();
  private conflict = false;
  private externalChangeDiagnostic: TextDocumentDiagnostic | undefined;

  private constructor(
    readonly identity: TextDocumentIdentity,
    readonly sessionId: string,
    private readonly dependencies: TextDocumentSessionDependencies,
    admitted: ReturnType<typeof admitTextDocument>,
  ) {
    this.source = admitted.source;
    this.baseSource = admitted.source;
    this.baseFingerprint = admitted.fingerprint;
    this.mode = admitted.mode;
    this.lineEnding = admitted.lineEnding;
    this.hasBom = admitted.hasBom;
  }

  static async open(
    identity: TextDocumentIdentity,
    dependencies: TextDocumentSessionDependencies,
  ): Promise<TextDocumentSession> {
    const result = await dependencies.reader.read(identity.locator, { maxBytes: 2 * 1024 * 1024 });
    if (result.status !== 'ready') {
      throw new TextDocumentError({ code: 'text-document-read-failed', severity: 'error' });
    }
    const admitted = admitTextDocument(
      identity.locator.file.path,
      result.bytes,
      result.fingerprint,
    );
    return new TextDocumentSession(
      identity,
      dependencies.createSessionId?.() ?? defaultSessionId(identity),
      dependencies,
      admitted,
    );
  }

  project(): TextDocumentProjection {
    const format = formatProjection(this.mode, this.source, this.identity.documentId);
    return Object.freeze({
      identity: this.identity,
      sessionId: this.sessionId,
      editSequence: this.editSequence,
      mode: this.mode,
      source: this.source,
      dirty: this.source !== this.baseSource,
      conflict: this.conflict,
      diagnostics: Object.freeze([
        ...format.diagnostics,
        ...(this.externalChangeDiagnostic ? [this.externalChangeDiagnostic] : []),
      ]),
      ...(format.screenplay ? { screenplay: format.screenplay } : {}),
    });
  }

  applyEdits(command: ApplyTextDocumentEditsCommand): TextDocumentProjection {
    this.assertCommand(command);
    const next = applyChanges(this.source, command.changes);
    this.requests.add(command.requestId);
    this.source = next;
    this.editSequence += 1;
    return this.project();
  }

  formatJson(requestId: string, expectedEditSequence: number): TextDocumentProjection {
    if (this.mode !== 'json') throw invalidChange();
    let formatted: string;
    try {
      formatted = `${JSON.stringify(JSON.parse(this.source), null, 2)}\n`;
    } catch {
      throw new TextDocumentError(jsonDiagnostic(this.source));
    }
    return this.applyEdits({
      identity: this.identity,
      sessionId: this.sessionId,
      requestId,
      expectedEditSequence,
      changes: [{ from: 0, to: this.source.length, insert: formatted }],
    });
  }

  async save(expectedEditSequence: number): Promise<TextDocumentProjection> {
    if (expectedEditSequence !== this.editSequence) throw staleEditSequence();
    const savedEditSequence = this.editSequence;
    const savedSource = this.source;
    const result = await this.dependencies.writer.write(
      this.identity.locator,
      encodeTextDocument(savedSource, this.lineEnding, this.hasBom),
      { conflict: 'replace', expectedFingerprint: this.baseFingerprint },
    );
    if (result.status !== 'written') {
      if (
        result.diagnostic.code === 'content-changed' ||
        result.diagnostic.code === 'content-conflict'
      ) {
        this.conflict = true;
        throw new TextDocumentError({ code: 'text-document-save-conflict', severity: 'error' });
      }
      throw new TextDocumentError({ code: 'text-document-save-failed', severity: 'error' });
    }
    if (!result.fingerprint) {
      throw new TextDocumentError({ code: 'text-document-save-failed', severity: 'error' });
    }
    this.baseFingerprint = result.fingerprint;
    if (this.editSequence === savedEditSequence) this.baseSource = savedSource;
    this.conflict = false;
    return this.project();
  }

  async reload(confirmDirty: boolean): Promise<TextDocumentProjection> {
    if (this.project().dirty && !confirmDirty) {
      throw new TextDocumentError({
        code: 'text-document-reload-confirmation-required',
        severity: 'warning',
      });
    }
    const result = await this.dependencies.reader.read(this.identity.locator, {
      maxBytes: 2 * 1024 * 1024,
    });
    if (result.status !== 'ready') {
      throw new TextDocumentError({ code: 'text-document-read-failed', severity: 'error' });
    }
    const admitted = admitTextDocument(
      this.identity.locator.file.path,
      result.bytes,
      result.fingerprint,
    );
    if (admitted.mode !== this.mode) throw invalidChange();
    this.source = admitted.source;
    this.baseSource = admitted.source;
    this.baseFingerprint = admitted.fingerprint;
    this.lineEnding = admitted.lineEnding;
    this.hasBom = admitted.hasBom;
    this.editSequence += 1;
    this.conflict = false;
    this.externalChangeDiagnostic = undefined;
    return this.project();
  }

  async observeExternalChange(): Promise<TextDocumentProjection | undefined> {
    let result: Awaited<ReturnType<ContentReadService['read']>>;
    try {
      result = await this.dependencies.reader.read(this.identity.locator, {
        maxBytes: 2 * 1024 * 1024,
      });
    } catch {
      return this.projectExternalChangeUnavailable();
    }
    if (result.status !== 'ready') return this.projectExternalChangeUnavailable();
    if (fingerprintsEqual(result.fingerprint, this.baseFingerprint)) {
      if (!this.externalChangeDiagnostic) return undefined;
      this.externalChangeDiagnostic = undefined;
      return this.project();
    }

    let admitted: ReturnType<typeof admitTextDocument>;
    try {
      admitted = admitTextDocument(
        this.identity.locator.file.path,
        result.bytes,
        result.fingerprint,
      );
    } catch (error) {
      if (!(error instanceof TextDocumentError)) throw error;
      return this.projectExternalChangeUnavailable();
    }
    if (admitted.mode !== this.mode) return this.projectExternalChangeUnavailable();

    this.externalChangeDiagnostic = undefined;
    if (this.project().dirty) {
      if (this.conflict) return undefined;
      this.conflict = true;
      return this.project();
    }

    this.source = admitted.source;
    this.baseSource = admitted.source;
    this.baseFingerprint = admitted.fingerprint;
    this.lineEnding = admitted.lineEnding;
    this.hasBom = admitted.hasBom;
    this.editSequence += 1;
    this.conflict = false;
    return this.project();
  }

  async close(decision: TextDocumentCloseDecision): Promise<'closed' | 'cancelled'> {
    if (!this.project().dirty || decision === 'discard') return 'closed';
    if (decision === 'cancel') return 'cancelled';
    await this.save(this.editSequence);
    return 'closed';
  }

  private assertCommand(command: ApplyTextDocumentEditsCommand): void {
    this.assertSessionCommand(command);
    validateChanges(command.changes, this.source.length);
  }

  private projectExternalChangeUnavailable(): TextDocumentProjection | undefined {
    if (this.externalChangeDiagnostic) return undefined;
    this.externalChangeDiagnostic = {
      code: 'text-document-external-change-unavailable',
      severity: 'error',
    };
    return this.project();
  }

  private assertSessionCommand(command: {
    readonly identity: TextDocumentIdentity;
    readonly sessionId: string;
    readonly requestId: string;
    readonly expectedEditSequence: number;
  }): void {
    if (command.sessionId !== this.sessionId || !identitiesEqual(command.identity, this.identity)) {
      throw new TextDocumentError({ code: 'text-document-identity-mismatch', severity: 'error' });
    }
    if (command.expectedEditSequence !== this.editSequence) throw staleEditSequence();
    if (!command.requestId || this.requests.has(command.requestId)) {
      throw new TextDocumentError({ code: 'text-document-request-reused', severity: 'error' });
    }
  }
}

export class TextDocumentSessionManager {
  private readonly sessions = new Map<string, TextDocumentSession>();

  constructor(private readonly dependencies: TextDocumentSessionDependencies) {}

  async open(identity: TextDocumentIdentity): Promise<TextDocumentProjection> {
    const key = identityKey(identity);
    let session = this.sessions.get(key);
    if (!session) {
      session = await TextDocumentSession.open(identity, this.dependencies);
      this.sessions.set(key, session);
    }
    return session.project();
  }

  require(sessionId: string): TextDocumentSession {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.sessionId === sessionId,
    );
    if (!session) {
      throw new TextDocumentError({ code: 'text-document-session-missing', severity: 'error' });
    }
    return session;
  }

  releaseClean(sessionId: string): boolean {
    const entry = [...this.sessions.entries()].find(
      ([, session]) => session.sessionId === sessionId,
    );
    if (!entry || entry[1].project().dirty) return false;
    return this.sessions.delete(entry[0]);
  }
}

function applyChanges(source: string, changes: readonly TextDocumentChange[]): string {
  let cursor = 0;
  let result = '';
  for (const change of changes) {
    result += source.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return result + source.slice(cursor);
}

function validateChanges(changes: readonly TextDocumentChange[], sourceLength: number): void {
  if (changes.length === 0) throw invalidChange();
  let previousTo = 0;
  for (const change of changes) {
    if (
      !Number.isSafeInteger(change.from) ||
      !Number.isSafeInteger(change.to) ||
      change.from < previousTo ||
      change.from < 0 ||
      change.to < change.from ||
      change.to > sourceLength
    ) {
      throw invalidChange();
    }
    previousTo = change.to;
  }
}

function formatProjection(
  mode: TextDocumentMode,
  source: string,
  sourceId: string,
): {
  diagnostics: readonly TextDocumentDiagnostic[];
  screenplay?: import('@neko/screenplay-domain').FountainDocument;
} {
  if (mode === 'json') {
    try {
      JSON.parse(source);
      return { diagnostics: [] };
    } catch {
      return { diagnostics: [jsonDiagnostic(source)] };
    }
  }
  if (mode === 'fountain') {
    const result = parseFountainDocument(source, sourceId);
    if (result.status === 'failed') {
      return {
        diagnostics: result.diagnostics.map(() => ({
          code: 'text-document-invalid-change' as const,
          severity: 'error' as const,
        })),
      };
    }
    return { diagnostics: [], screenplay: result.document };
  }
  return { diagnostics: [] };
}

function jsonDiagnostic(source: string): TextDocumentDiagnostic {
  try {
    JSON.parse(source);
  } catch (error) {
    const match = error instanceof Error ? /position (\d+)/.exec(error.message) : undefined;
    const from = match?.[1] === undefined ? 0 : Number(match[1]);
    return { code: 'text-document-invalid-json', severity: 'error', from, to: from + 1 };
  }
  throw new Error('JSON diagnostic requested for valid source.');
}

function identitiesEqual(left: TextDocumentIdentity, right: TextDocumentIdentity): boolean {
  return (
    ownersEqual(left.owner, right.owner) &&
    left.workspaceId === right.workspaceId &&
    left.documentId === right.documentId &&
    contentLocatorsEqual(left.locator, right.locator)
  );
}

function identityKey(identity: TextDocumentIdentity): string {
  return JSON.stringify([
    [identity.owner.kind, identity.owner.windowId, identity.owner.projectId],
    identity.workspaceId,
    identity.documentId,
    identity.locator.file.path,
  ]);
}

function defaultSessionId(identity: TextDocumentIdentity): string {
  const ownerId = `${identity.owner.windowId}:${identity.owner.projectId}`;
  return `text-document:window:${ownerId}:${identity.workspaceId}:${identity.documentId}`;
}

function ownersEqual(
  left: TextDocumentIdentity['owner'],
  right: TextDocumentIdentity['owner'],
): boolean {
  return left.windowId === right.windowId && left.projectId === right.projectId;
}

function staleEditSequence(): TextDocumentError {
  return new TextDocumentError({ code: 'text-document-stale-edit-sequence', severity: 'error' });
}

function invalidChange(): TextDocumentError {
  return new TextDocumentError({ code: 'text-document-invalid-change', severity: 'error' });
}

function fingerprintsEqual(left: ContentFingerprint, right: ContentFingerprint): boolean {
  return left.strategy === right.strategy && left.value === right.value;
}
