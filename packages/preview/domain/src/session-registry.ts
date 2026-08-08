import type {
  PreviewProjection,
  PreviewRuntimeIdentity,
  PreviewViewPresentation,
} from './index.js';

export interface PreviewSessionSnapshot {
  readonly identity: PreviewRuntimeIdentity;
  readonly projection: PreviewProjection;
}

export interface PreviewSessionTransition {
  readonly sessionId: string;
  readonly previous: PreviewSessionSnapshot;
  readonly next: PreviewSessionSnapshot;
}

export class PreviewSessionRegistry {
  private readonly sessions = new Map<string, PreviewSessionSnapshot>();
  private readonly transientSessions = new Map<string, string>();
  private disposed = false;

  register(projection: PreviewProjection): readonly string[] {
    this.requireActive();
    const sessionId = projection.identity.sessionId;
    if (this.sessions.has(sessionId)) {
      throw new Error(`Preview session '${sessionId}' is already registered.`);
    }
    this.sessions.set(sessionId, freezeSession(projection));
    if (projection.presentation === 'pinned') return [];
    const released: string[] = [];
    for (const [candidateId, candidate] of this.sessions) {
      if (
        candidateId === sessionId ||
        candidate.identity.windowId !== projection.identity.windowId ||
        candidate.identity.projectId !== projection.identity.projectId ||
        candidate.projection.presentation !== projection.presentation
      ) {
        continue;
      }
      this.sessions.delete(candidateId);
      released.push(candidateId);
    }
    return Object.freeze(released);
  }

  unregister(sessionId: string): void {
    this.requireActive();
    if (!this.sessions.delete(sessionId)) {
      throw new Error(`Preview session '${sessionId}' is unavailable.`);
    }
  }

  read(sessionId: string): PreviewSessionSnapshot {
    this.requireActive();
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Preview session '${sessionId}' is unavailable.`);
    return session;
  }

  has(sessionId: string): boolean {
    this.requireActive();
    return this.sessions.has(sessionId);
  }

  assertIdentity(identity: PreviewRuntimeIdentity): PreviewSessionSnapshot {
    const session = this.read(identity.sessionId);
    assertSessionIdentity(session.identity, identity);
    return session;
  }

  planPresentation(
    sessionId: string,
    presentation: Exclude<PreviewViewPresentation, 'temporary'>,
    nextViewId: string,
  ): PreviewSessionTransition {
    const session = this.read(sessionId);
    if (session.projection.presentation === presentation) {
      return {
        sessionId,
        previous: session,
        next: session,
      };
    }
    const identity: PreviewRuntimeIdentity = Object.freeze({
      ...session.identity,
      viewId: nextViewId,
    });
    const projection = Object.freeze<PreviewProjection>({
      ...session.projection,
      identity,
      presentation,
    });
    return Object.freeze({
      sessionId,
      previous: session,
      next: freezeSession(projection),
    });
  }

  planPreparation(sessionId: string, projection: PreviewProjection): PreviewSessionTransition {
    const session = this.read(sessionId);
    if (session.projection.status !== 'loading') {
      throw new Error(`Preview session '${sessionId}' is not awaiting preparation.`);
    }
    assertSessionIdentity(session.identity, projection.identity);
    if (projection.presentation !== session.projection.presentation) {
      throw new Error(`Preview session '${sessionId}' preparation changed its presentation.`);
    }
    if (projection.status === 'loading') {
      throw new Error(`Preview session '${sessionId}' preparation did not settle.`);
    }
    return Object.freeze({
      sessionId,
      previous: session,
      next: freezeSession(projection),
    });
  }

  planClose(sessionId: string): PreviewSessionTransition {
    const session = this.read(sessionId);
    const projection = Object.freeze<PreviewProjection>({
      identity: session.identity,
      presentation: session.projection.presentation,
      status: 'unavailable',
      diagnostic: {
        code: 'preview-descriptor-released',
        message: 'Preview View was closed.',
      },
    });
    return Object.freeze({
      sessionId,
      previous: session,
      next: freezeSession(projection),
    });
  }

  commit(transition: PreviewSessionTransition): PreviewSessionSnapshot {
    this.requireActive();
    const current = this.read(transition.sessionId);
    if (current !== transition.previous) {
      throw new Error(
        `Preview session '${transition.sessionId}' changed before its transition committed.`,
      );
    }
    this.sessions.set(transition.sessionId, transition.next);
    return transition.next;
  }

  commitClose(transition: PreviewSessionTransition): PreviewProjection {
    this.commit(transition);
    this.sessions.delete(transition.sessionId);
    return transition.next.projection;
  }

  registerTransient(windowId: string, sessionId: string): void {
    this.requireActive();
    if (this.transientSessions.has(sessionId) || this.sessions.has(sessionId)) {
      throw new Error(`Preview session '${sessionId}' is already registered.`);
    }
    this.transientSessions.set(sessionId, windowId);
  }

  releaseTransient(windowId: string, sessionId: string): void {
    this.requireActive();
    if (this.transientSessions.get(sessionId) !== windowId) {
      throw new Error(`Quick Preview session '${sessionId}' is unavailable.`);
    }
    this.transientSessions.delete(sessionId);
  }

  reconcileWindow(windowId: string, attachedSessionIds: readonly string[]): readonly string[] {
    this.requireActive();
    const attached = new Set(attachedSessionIds);
    const released: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.identity.windowId !== windowId || attached.has(sessionId)) continue;
      this.sessions.delete(sessionId);
      released.push(sessionId);
    }
    return Object.freeze(released);
  }

  detachWindow(windowId: string): readonly string[] {
    this.requireActive();
    const released: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.identity.windowId !== windowId) continue;
      this.sessions.delete(sessionId);
      released.push(sessionId);
    }
    for (const [sessionId, ownerWindowId] of this.transientSessions) {
      if (ownerWindowId !== windowId) continue;
      this.transientSessions.delete(sessionId);
      released.push(sessionId);
    }
    return Object.freeze(released);
  }

  dispose(): readonly string[] {
    if (this.disposed) return [];
    this.disposed = true;
    const released = Object.freeze([...this.sessions.keys(), ...this.transientSessions.keys()]);
    this.sessions.clear();
    this.transientSessions.clear();
    return released;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Preview session registry is disposed.');
  }
}

function freezeSession(projection: PreviewProjection): PreviewSessionSnapshot {
  return Object.freeze({ identity: projection.identity, projection });
}

function assertSessionIdentity(
  expected: PreviewRuntimeIdentity,
  actual: PreviewRuntimeIdentity,
): void {
  for (const key of [
    'projectId',
    'workspaceId',
    'windowId',
    'viewId',
    'viewInstanceId',
    'documentId',
    'sessionId',
    'rendererSessionId',
  ] as const) {
    if (expected[key] !== actual[key]) {
      throw new Error(`Preview ${key} does not match its owning runtime.`);
    }
  }
}
