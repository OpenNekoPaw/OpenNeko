import * as vscode from 'vscode';
import type {
  CreativeEntityRef,
  NpcAgentWorkflowRequest,
  NpcTranscriptArtifact,
} from '@neko/shared';
import {
  EmbodyCharacterSession,
  type CharacterEvidenceBundle,
  type CharacterEvidenceLoader,
  type CharacterEvidenceRequest,
  type EmbodyCharacterEvidenceSnapshot,
  type EmbodyCharacterResponder,
} from '@neko/entity';
import type { NpcProfileAssemblyResult } from '@neko/entity/projections';
import {
  buildEmbodyCharacterSessionExitedMessage,
  buildEmbodyCharacterSessionStartedMessage,
  buildErrorMessage,
  buildStreamCompleteMessage,
  buildStreamTextMessage,
  buildThinkingMessage,
  type EmbodyCharacterSessionProjection,
  type OpenTab,
} from '@neko-agent/types';
import { getLogger } from '../base';
import {
  createDefaultCharacterProfileAssembler,
  createDashboardCharacterProfileEvidenceReader,
  defaultCharacterEvidenceBudgetForMode,
  summarizeCharacterProfile,
  upsertCharacterRoleTab,
  type CharacterProfileEvidenceReader,
  type CharacterProfileAssemblerPort,
} from './characterDialogueController';
import { createDefaultCharacterEvidenceLoader } from '../evidence/characterEvidenceLoader';

export interface EmbodyCharacterControllerDeps {
  readonly getWebview: () => vscode.Webview | undefined;
  readonly getProjectRoot: () => string | undefined;
  readonly createAssembler?: (projectRoot: string) => CharacterProfileAssemblerPort;
  readonly createEvidenceReader?: (projectRoot: string) => EmbodyCharacterEvidenceReaderPort;
  readonly createEvidenceLoader?: (projectRoot: string) => CharacterEvidenceLoader;
  readonly createResponder?: () => EmbodyCharacterResponder;
  readonly updateTabState: (openTabs: OpenTab[], activeTabId: string | null) => void;
  readonly getTabState: () => {
    readonly openTabs: readonly OpenTab[];
    readonly activeTabId: string | null;
  };
  readonly sendTabState: () => void;
  readonly now?: () => string;
  readonly createSessionId?: (entityRef: CreativeEntityRef) => string;
  readonly logger?: Pick<ReturnType<typeof getLogger>, 'warn' | 'debug'>;
}

export interface EmbodyCharacterEvidenceReaderPort extends CharacterProfileEvidenceReader {}

export interface EmbodyCharacterLaunchResult {
  readonly sessionId: string;
  readonly tab: OpenTab;
  readonly session: EmbodyCharacterSessionProjection;
}

export interface EmbodyCharacterExitResult {
  readonly sessionId: string;
  readonly artifact: NpcTranscriptArtifact;
}

const logger = getLogger('EmbodyCharacterController');

export class EmbodyCharacterController implements vscode.Disposable {
  private readonly sessions = new Map<string, EmbodyCharacterSession>();
  private readonly sessionProjectRoots = new Map<string, string>();

  constructor(private readonly deps: EmbodyCharacterControllerDeps) {}

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async launch(request: NpcAgentWorkflowRequest): Promise<EmbodyCharacterLaunchResult | null> {
    const projectRoot = this.resolveProjectRoot(request);
    if (!projectRoot) {
      this.postGlobalError('Open a workspace before starting an Embody Character session.');
      return null;
    }

    const entityRef = this.normalizeEntityRef(request.entityRef, projectRoot);
    const assembler =
      this.deps.createAssembler?.(projectRoot) ??
      createDefaultCharacterProfileAssembler(projectRoot);
    const assembly = await assembler.assembleProfile({ entityRef });
    if (assembly.status !== 'assembled') {
      this.postGlobalError(assembly.reason);
      return null;
    }

    const evidence = await this.collectEvidence(entityRef, assembly);
    const sessionId =
      this.deps.createSessionId?.(entityRef) ?? createEmbodyCharacterSessionId(entityRef);
    const prompt = request.prompt?.trim();
    const session = new EmbodyCharacterSession({
      id: sessionId,
      entityRef,
      profileSnapshot: assembly.profile,
      evidenceSnapshot: evidence,
      responder: this.createResponder(),
      ...(prompt ? { prompt } : {}),
      locale: vscode.env.language,
      now: this.now,
    });
    this.sessions.set(sessionId, session);
    this.sessionProjectRoots.set(sessionId, projectRoot);

    const projection = projectEmbodyCharacterSession(session, {
      projectRoot,
      startedAt: this.now(),
      request,
    });
    const tab: OpenTab = {
      id: `tab-${sessionId}`,
      title: `Embody: ${projection.displayName}`,
      conversationId: sessionId,
      kind: 'embody-character',
      embodyCharacterSession: projection,
    };
    const openTabs = upsertCharacterRoleTab(this.deps.getTabState().openTabs, tab);
    this.deps.updateTabState(openTabs, tab.id);
    this.deps
      .getWebview()
      ?.postMessage(buildEmbodyCharacterSessionStartedMessage({ tab, session: projection }));
    this.deps.sendTabState();

    return { sessionId, tab, session: projection };
  }

  async routeUserMessage(sessionId: string, message: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const webview = this.deps.getWebview();
    const trimmed = message.trim();
    if (!trimmed) return true;

    webview?.postMessage(buildThinkingMessage(sessionId));

    try {
      const turnEvidence = await this.loadTurnEvidence(session, trimmed);
      const turn = await session.sendUserMessage(trimmed, {
        ...(turnEvidence ? { turnEvidence } : {}),
      });
      webview?.postMessage(
        buildStreamTextMessage({
          conversationId: sessionId,
          messageId: turn.feedbackMessage.id,
          content: turn.feedbackMessage.content,
        }),
      );
      webview?.postMessage(
        buildStreamCompleteMessage({
          conversationId: sessionId,
          messageId: turn.feedbackMessage.id,
        }),
      );
    } catch (error) {
      webview?.postMessage(
        buildErrorMessage({
          conversationId: sessionId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    return true;
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.cancel();
    return true;
  }

  async exit(sessionId: string): Promise<EmbodyCharacterExitResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const artifact = session.toArtifact();
    session.dispose();
    this.sessions.delete(sessionId);
    this.sessionProjectRoots.delete(sessionId);
    this.markTabExited(sessionId);
    this.deps.getWebview()?.postMessage(
      buildEmbodyCharacterSessionExitedMessage({
        sessionId,
        artifact,
      }),
    );
    return { sessionId, artifact };
  }

  dispose(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      void this.exit(sessionId);
    }
  }

  private async collectEvidence(
    entityRef: CreativeEntityRef,
    assembly: Extract<NpcProfileAssemblyResult, { readonly status: 'assembled' }>,
  ): Promise<EmbodyCharacterEvidenceSnapshot> {
    const projectRoot = entityRef.projectRoot;
    if (!projectRoot) {
      return createEmptyEvidence();
    }
    const reader =
      this.deps.createEvidenceReader?.(projectRoot) ??
      createDashboardCharacterProfileEvidenceReader(projectRoot);
    const [relationships, occurrences, representationHints, scriptContextFacts] = await Promise.all(
      [
        reader.listRelationships(entityRef),
        reader.listOccurrences(entityRef),
        reader.listRepresentationHints(entityRef),
        reader.listScriptContextFacts(entityRef),
      ],
    );
    return {
      relationships,
      occurrences,
      representationHints,
      scriptContextFacts: [...scriptContextFacts, ...assembly.profile.facts],
    };
  }

  private createResponder(): EmbodyCharacterResponder {
    const createResponder = this.deps.createResponder;
    if (!createResponder) {
      throw new Error('Embody Character responder requires an Agent semantic port.');
    }
    return createResponder();
  }

  private async loadTurnEvidence(
    session: EmbodyCharacterSession,
    query: string,
  ): Promise<CharacterEvidenceBundle | undefined> {
    const projectRoot =
      this.sessionProjectRoots.get(session.id) ??
      session.entityRef.projectRoot ??
      this.deps.getProjectRoot();
    if (!projectRoot) return undefined;
    const request: CharacterEvidenceRequest = {
      entityRef: this.normalizeEntityRef(session.entityRef, projectRoot),
      mode: 'embody-character',
      query,
      projectRoot,
      budget: defaultCharacterEvidenceBudgetForMode('embody-character'),
      transcript: session.getTranscript(),
    };
    try {
      return await this.getEvidenceLoader(projectRoot).loadEvidence(request);
    } catch (error) {
      (this.deps.logger ?? logger).warn(
        'Character evidence loading failed; continuing feedback turn',
        {
          entityId: request.entityRef.entityId,
          error,
        },
      );
      return undefined;
    }
  }

  private getEvidenceLoader(projectRoot: string): CharacterEvidenceLoader {
    return (
      this.deps.createEvidenceLoader?.(projectRoot) ??
      createDefaultCharacterEvidenceLoader(projectRoot)
    );
  }

  private resolveProjectRoot(request: NpcAgentWorkflowRequest): string | undefined {
    return request.projectRoot ?? request.entityRef.projectRoot ?? this.deps.getProjectRoot();
  }

  private normalizeEntityRef(entityRef: CreativeEntityRef, projectRoot: string): CreativeEntityRef {
    return {
      ...entityRef,
      projectRoot,
      source: entityRef.source ?? 'neko-entity',
    };
  }

  private markTabExited(sessionId: string): void {
    const tabState = this.deps.getTabState();
    const openTabs = tabState.openTabs.map((tab) =>
      tab.conversationId === sessionId && tab.embodyCharacterSession
        ? {
            ...tab,
            embodyCharacterSession: {
              ...tab.embodyCharacterSession,
              status: 'exited' as const,
            },
          }
        : tab,
    );
    this.deps.updateTabState(openTabs, tabState.activeTabId);
    this.deps.sendTabState();
  }

  private postGlobalError(message: string): void {
    this.deps.getWebview()?.postMessage({ type: 'globalError', message });
    (this.deps.logger ?? logger).warn('Embody Character launch failed', { message });
  }

  private readonly now = (): string => this.deps.now?.() ?? new Date().toISOString();
}

export function projectEmbodyCharacterSession(
  session: Pick<
    EmbodyCharacterSession,
    'id' | 'entityRef' | 'profileSnapshot' | 'prompt' | 'status'
  >,
  input: {
    readonly projectRoot?: string;
    readonly startedAt: string;
    readonly request: NpcAgentWorkflowRequest;
  },
): EmbodyCharacterSessionProjection {
  return {
    sessionId: session.id,
    entityId: session.entityRef.entityId,
    displayName: session.profileSnapshot.displayName,
    profile: session.profileSnapshot,
    ...(session.entityRef.source ? { source: session.entityRef.source } : {}),
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
    scopeSummary: summarizeScopes(input.request),
    ...(session.prompt ? { prompt: session.prompt } : {}),
    summary: summarizeCharacterProfile(session.profileSnapshot),
    startedAt: input.startedAt,
    status: session.status === 'disposed' ? 'exited' : 'active',
  };
}

function createEmptyEvidence(): EmbodyCharacterEvidenceSnapshot {
  return {
    relationships: [],
    occurrences: [],
    representationHints: [],
    scriptContextFacts: [],
  };
}

function createEmbodyCharacterSessionId(entityRef: CreativeEntityRef): string {
  const suffix = Date.now().toString(36);
  return `embody-${entityRef.entityId}-${suffix}`;
}

function summarizeScopes(request: NpcAgentWorkflowRequest): readonly string[] {
  return request.scopes?.length
    ? request.scopes.map(
        (scope) => `${scope.kind}: ${scope.label ? `${scope.label} ` : ''}${scope.ref}`,
      )
    : ['project: current project'];
}
