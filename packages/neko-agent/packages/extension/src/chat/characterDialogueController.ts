import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
  CreativeEntity,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  CreativeEntityRepresentationHint,
  CreativeEntitySourceKind,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityOccurrenceRef,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRelationshipSummary,
  DashboardCreativeEntityRow,
  DashboardCreativeEntitySource,
  NpcProfileFact,
  NpcProfileRelationshipValue,
  NpcSerializableValue,
  NpcEvaluationReport,
  NpcEvaluationSuggestion,
  NpcProfileSource,
  NpcTestBenchLaunchRequest,
  NpcTestMode,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
} from '@neko/shared';
import { CHARACTER_ROLE_TEST_ARTIFACT_DIR, isCreativeEntityRef } from '@neko/shared';
import {
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityDetail,
  isDashboardCreativeEntitySource,
  type DashboardCreativeEntitySourceRequest,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  CharacterDialogueSession,
  createDefaultCharacterDialogueSessionId,
  createCharacterDialogueRuntimeService,
  type CharacterDialogueResponder,
  CharacterEvidenceBundle,
  CharacterEvidenceBudget,
  CharacterEvidenceLoader,
  CharacterEvidenceRequest,
} from '@neko/entity';
import type {
  AssembleNpcProfileInput,
  NpcProfileAssemblerReaders,
  NpcProfileAssemblyResult,
} from '@neko/entity/projections';
import { NpcProfileAssembler } from '@neko/entity/projections';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';
import {
  buildCharacterDialogueSessionExitedMessage,
  buildCharacterDialogueSessionStartedMessage,
  buildErrorMessage,
  buildStreamCompleteMessage,
  buildStreamTextMessage,
  buildThinkingMessage,
  type CharacterDialogueSessionProjection,
  type OpenTab,
} from '@neko-agent/types';
import { getLogger } from '../base';
import { createDefaultCharacterEvidenceLoader } from '../evidence/characterEvidenceLoader';

export interface CharacterDialogueControllerDeps {
  readonly getWebview: () => vscode.Webview | undefined;
  readonly getProjectRoot: () => string | undefined;
  readonly createAssembler?: (projectRoot: string) => CharacterProfileAssemblerPort;
  readonly createEvidenceLoader?: (projectRoot: string) => CharacterEvidenceLoader;
  readonly createResponder?: () => CharacterDialogueResponder;
  readonly updateTabState: (openTabs: OpenTab[], activeTabId: string | null) => void;
  readonly getTabState: () => {
    readonly openTabs: readonly OpenTab[];
    readonly activeTabId: string | null;
  };
  readonly sendTabState: () => void;
  readonly getActiveConversationId?: () => string | null;
  readonly resolveEntityRef?: (
    input: NpcEntityResolutionInput,
  ) => Promise<CreativeEntityRef | null>;
  readonly pickEntityRef?: (input: NpcEntityPickerInput) => Promise<CreativeEntityRef | null>;
  readonly chooseThinProfileAction?: (
    input: NpcThinProfileActionInput,
  ) => Promise<NpcThinProfileAction>;
  readonly enrichProfile?: (
    input: NpcProfileEnrichmentInput,
  ) => Promise<NpcProfileEnrichmentResult>;
  readonly promptUserSupplement?: (input: NpcManualSupplementInput) => Promise<string | undefined>;
  readonly evaluateTranscript?: (input: NpcEvaluationInput) => Promise<NpcEvaluationReport>;
  readonly chooseSavePolicy?: (input: NpcSavePolicyInput) => Promise<NpcTranscriptSavePolicy>;
  readonly saveTranscriptArtifact?: (
    input: NpcTranscriptArtifactSaveInput,
  ) => Promise<NpcTranscriptArtifactSaveResult | null>;
  readonly confirmSuggestionApply?: (
    input: NpcSuggestionApplyConfirmationInput,
  ) => Promise<boolean>;
  readonly applySuggestion?: (input: NpcSuggestionApplyInput) => Promise<NpcSuggestionApplyResult>;
  readonly now?: () => string;
  readonly createSessionId?: (entityRef: CreativeEntityRef) => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly logger?: Pick<ReturnType<typeof getLogger>, 'warn' | 'debug'>;
}

export interface CharacterProfileAssemblerPort {
  assembleProfile(input: AssembleNpcProfileInput): Promise<NpcProfileAssemblyResult>;
}

export interface NpcEntityResolutionInput {
  readonly token: string;
  readonly projectRoot: string;
}

export interface NpcEntityPickerInput {
  readonly projectRoot: string;
}

export type NpcThinProfileAction = 'start-now' | 'enrich-project' | 'manual-supplement';
export type NpcTranscriptSavePolicy = 'ask' | 'always' | 'never';

export interface NpcThinProfileActionInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
  readonly request: NpcTestBenchLaunchRequest;
}

export interface NpcProfileEnrichmentInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
  readonly request: NpcTestBenchLaunchRequest;
}

export interface NpcProfileEnrichmentResult {
  readonly profile: NpcProfileSource;
}

export interface NpcManualSupplementInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
}

export interface NpcEvaluationInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
}

export interface NpcSavePolicyInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
  readonly reason: NpcSessionExitReason;
}

export interface NpcTranscriptArtifactSaveInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
}

export interface NpcTranscriptArtifactSaveResult {
  readonly path: string;
}

export interface NpcSuggestionApplyConfirmationInput {
  readonly suggestion: NpcEvaluationSuggestion;
  readonly projectRoot: string;
}

export interface NpcSuggestionApplyInput {
  readonly suggestion: NpcEvaluationSuggestion;
  readonly projectRoot: string;
}

export interface NpcSuggestionApplyResult {
  readonly applied: boolean;
  readonly message?: string;
}

export type NpcSessionExitReason = 'user' | 'cancelled' | 'disposed';

export interface CharacterRoleEvidenceSnapshot {
  readonly relationships: readonly CreativeEntityRelationshipProjection[];
  readonly occurrences: readonly CreativeEntityOccurrenceProjection[];
  readonly representationHints: readonly CreativeEntityRepresentationHint[];
  readonly scriptContextFacts: readonly NpcProfileFact[];
}

export interface CharacterDialogueHeadlessProbeInput {
  readonly entityRef: CreativeEntityRef;
  readonly profile: NpcProfileSource;
  readonly messages: readonly string[];
  readonly mode?: NpcTestMode;
  readonly projectRoot?: string;
}

export interface CharacterRoleSkillPrimitivePorts {
  assembleProfile(input: AssembleNpcProfileInput): Promise<NpcProfileAssemblyResult>;
  collectEvidence(entityRef: CreativeEntityRef): Promise<CharacterRoleEvidenceSnapshot>;
  loadEvidence(
    request: Omit<CharacterEvidenceRequest, 'projectRoot'> & { readonly projectRoot?: string },
  ): Promise<CharacterEvidenceBundle>;
  runHeadlessDialogueProbe(
    input: CharacterDialogueHeadlessProbeInput,
  ): Promise<NpcTranscriptArtifact>;
  evaluateTranscript(input: NpcEvaluationInput): Promise<NpcEvaluationReport>;
  saveArtifact(
    input: NpcTranscriptArtifactSaveInput,
  ): Promise<NpcTranscriptArtifactSaveResult | null>;
  applySuggestionWithConfirmation(
    input: NpcSuggestionApplyInput,
  ): Promise<NpcSuggestionApplyResult>;
}

export interface CharacterDialogueLaunchResult {
  readonly sessionId: string;
  readonly tab: OpenTab;
  readonly session: CharacterDialogueSessionProjection;
}

export interface CharacterDialogueExitResult {
  readonly sessionId: string;
  readonly artifact: NpcTranscriptArtifact;
  readonly savedPath?: string;
}

interface NpcEntityQuickPickItem extends vscode.QuickPickItem {
  readonly ref: CreativeEntityRef;
  readonly aliases?: readonly string[];
}

const logger = getLogger('CharacterDialogueController');

export class CharacterDialogueController implements vscode.Disposable {
  private readonly sessions = new Map<string, CharacterDialogueSession>();
  private readonly sessionProjectRoots = new Map<string, string>();
  private readonly pendingRouteAbortControllers = new Map<string, AbortController>();
  private readonly deps: CharacterDialogueControllerDeps;

  constructor(deps: CharacterDialogueControllerDeps) {
    this.deps = deps;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async launch(request: NpcTestBenchLaunchRequest): Promise<CharacterDialogueLaunchResult | null> {
    const projectRoot = this.resolveProjectRoot(request);
    if (!projectRoot) {
      this.postGlobalError('Open a workspace before starting a Character Dialogue session.');
      return null;
    }

    const entityRef = this.normalizeEntityRef(request.entityRef, projectRoot);
    const assembler =
      this.deps.createAssembler?.(projectRoot) ??
      createDefaultCharacterProfileAssembler(projectRoot);
    const assembly = await assembler.assembleProfile({
      entityRef,
      ...(request.userSupplements ? { userSupplements: request.userSupplements } : {}),
    });
    if (assembly.status !== 'assembled') {
      this.postGlobalError(assembly.reason);
      return null;
    }

    const runtime = this.createRuntimeService();
    const preparedProfile = await runtime.prepareProfileForLaunch({
      profile: assembly.profile,
      projectRoot,
      request,
    });
    if (preparedProfile.status === 'cancelled') {
      this.postGlobalError(preparedProfile.message);
      return null;
    }
    const profile = preparedProfile.profile;

    const mode = request.mode ?? 'roleplay';
    const session = runtime.createSession({
      entityRef,
      profile,
      mode,
      locale: vscode.env.language,
    });
    const sessionId = session.id;
    this.sessions.set(sessionId, session);
    this.sessionProjectRoots.set(sessionId, projectRoot);

    const projection = projectCharacterDialogueSession(session, {
      projectRoot,
      startedAt: this.now(),
    });
    const tab: OpenTab = {
      id: `tab-${sessionId}`,
      title: `Character Dialogue: ${projection.displayName}`,
      conversationId: sessionId,
      kind: 'character-dialogue',
      characterDialogueSession: projection,
    };
    const openTabs = upsertCharacterRoleTab(this.deps.getTabState().openTabs, tab);
    this.deps.updateTabState(openTabs, tab.id);
    this.deps
      .getWebview()
      ?.postMessage(buildCharacterDialogueSessionStartedMessage({ tab, session: projection }));
    this.deps.sendTabState();

    if (request.initialUserMessage?.trim()) {
      await this.routeUserMessage(sessionId, request.initialUserMessage);
    }

    return { sessionId, tab, session: projection };
  }

  async routeUserMessage(sessionId: string, message: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const webview = this.deps.getWebview();
    const trimmed = message.trim();
    if (!trimmed) {
      return true;
    }

    webview?.postMessage(buildThinkingMessage(sessionId));
    const routeAbortController = new AbortController();
    this.pendingRouteAbortControllers.set(sessionId, routeAbortController);

    try {
      const projectRoot =
        this.sessionProjectRoots.get(session.id) ??
        session.entityRef.projectRoot ??
        this.deps.getProjectRoot();
      const turnEvidence = projectRoot
        ? await this.createRuntimeService().loadTurnEvidence({
            session,
            projectRoot,
            query: trimmed,
            mode: 'character-dialogue',
          })
        : undefined;
      assertCharacterDialogueRouteNotAborted(routeAbortController.signal);
      const turn = await session.sendUserMessage(trimmed, {
        ...(turnEvidence ? { turnEvidence } : {}),
      });
      webview?.postMessage(
        buildStreamTextMessage({
          conversationId: sessionId,
          messageId: turn.npcMessage.id,
          content: turn.npcMessage.content,
        }),
      );
      webview?.postMessage(
        buildStreamCompleteMessage({
          conversationId: sessionId,
          messageId: turn.npcMessage.id,
        }),
      );
    } catch (error) {
      webview?.postMessage(
        buildErrorMessage({
          conversationId: sessionId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      if (this.pendingRouteAbortControllers.get(sessionId) === routeAbortController) {
        this.pendingRouteAbortControllers.delete(sessionId);
      }
    }

    return true;
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.pendingRouteAbortControllers.get(sessionId)?.abort();
    session.cancel();
    return true;
  }

  async exit(
    sessionId: string,
    reason: NpcSessionExitReason = 'user',
  ): Promise<CharacterDialogueExitResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const projectRoot = session.entityRef.projectRoot ?? this.deps.getProjectRoot();
    const initialArtifact = session.toArtifact();
    const runtime = this.createRuntimeService();
    const artifact =
      projectRoot && reason !== 'disposed'
        ? await runtime.evaluateArtifact({ artifact: initialArtifact, projectRoot })
        : initialArtifact;
    const saved = projectRoot
      ? await runtime.maybeSaveArtifact({
          artifact,
          projectRoot,
          reason,
        })
      : null;
    session.dispose();
    this.sessions.delete(sessionId);
    this.sessionProjectRoots.delete(sessionId);
    this.markTabExited(sessionId);
    this.deps.getWebview()?.postMessage(
      buildCharacterDialogueSessionExitedMessage({
        sessionId,
        artifact,
        ...(saved?.path ? { savedPath: saved.path } : {}),
      }),
    );
    return {
      sessionId,
      artifact,
      ...(saved?.path ? { savedPath: saved.path } : {}),
    };
  }

  async exitActive(candidateConversationId?: string): Promise<CharacterDialogueExitResult | null> {
    const tabState = this.deps.getTabState();
    const activeTab = tabState.activeTabId
      ? tabState.openTabs.find((tab) => tab.id === tabState.activeTabId)
      : undefined;
    const sessionId =
      activeTab?.kind === 'character-dialogue'
        ? activeTab.conversationId
        : candidateConversationId && this.hasSession(candidateConversationId)
          ? candidateConversationId
          : undefined;
    if (!sessionId) {
      this.postGlobalError('No active Character Dialogue session to exit.');
      return null;
    }
    return this.exit(sessionId);
  }

  async applyEvaluationSuggestion(input: {
    readonly suggestion: NpcEvaluationSuggestion;
    readonly projectRoot?: string;
  }): Promise<NpcSuggestionApplyResult> {
    const projectRoot =
      input.projectRoot ??
      (input.suggestion.applyTarget.kind === 'entity-metadata'
        ? input.suggestion.applyTarget.entityRef.projectRoot
        : undefined);
    const resolvedProjectRoot = projectRoot ?? this.deps.getProjectRoot();
    if (!resolvedProjectRoot) {
      return { applied: false, message: 'Open a workspace before applying character suggestions.' };
    }

    return this.createRuntimeService().applySuggestionWithConfirmation({
      suggestion: input.suggestion,
      projectRoot: resolvedProjectRoot,
    });
  }

  private createRuntimeService() {
    return createCharacterDialogueRuntimeService({
      ports: {
        createResponder: () => this.createResponder(),
        createEvidenceLoader: (projectRoot) => this.getEvidenceLoader(projectRoot),
        selectEvidenceBudget: (mode) => defaultCharacterEvidenceBudgetForMode(mode),
        chooseThinProfileAction: async (profileInput) =>
          (await this.deps.chooseThinProfileAction?.(profileInput)) ??
          (await defaultChooseThinProfileAction(profileInput.profile)),
        enrichProfile: async (profileInput) =>
          requireCharacterSemanticPort(
            this.deps.enrichProfile,
            'Character profile enrichment',
          )(profileInput),
        promptUserSupplement: async (supplementInput) =>
          (await this.deps.promptUserSupplement?.(supplementInput)) ?? undefined,
        evaluateTranscript: async (evaluationInput) =>
          requireCharacterSemanticPort(
            this.deps.evaluateTranscript,
            'Character evaluation',
          )(evaluationInput),
        chooseSavePolicy: async (saveInput) =>
          (await this.deps.chooseSavePolicy?.(saveInput)) ??
          (await defaultChooseTranscriptSavePolicy(saveInput)),
        saveTranscriptArtifact: (saveInput) =>
          (this.deps.saveTranscriptArtifact ?? defaultSaveTranscriptArtifact)(saveInput),
        confirmSuggestionApply: async (suggestionInput) =>
          (await this.deps.confirmSuggestionApply?.(suggestionInput)) ?? false,
        applySuggestion: (suggestionInput) =>
          (this.deps.applySuggestion ?? defaultApplyCharacterSuggestion)(suggestionInput),
      },
      locale: vscode.env.language,
      now: this.now,
      ...(this.deps.createSessionId ? { createSessionId: this.deps.createSessionId } : {}),
      ...(this.deps.createMessageId ? { createMessageId: this.deps.createMessageId } : {}),
      logger: this.deps.logger ?? logger,
    });
  }

  createSkillPrimitivePorts(
    input: {
      readonly projectRoot?: string;
    } = {},
  ): CharacterRoleSkillPrimitivePorts {
    const resolveProjectRoot = (entityRef?: CreativeEntityRef): string => {
      const projectRoot = input.projectRoot ?? entityRef?.projectRoot ?? this.deps.getProjectRoot();
      if (!projectRoot) {
        throw new Error('Open a workspace before running character role Skill primitives.');
      }
      return projectRoot;
    };

    return {
      assembleProfile: async (assemblyInput) => {
        const projectRoot = resolveProjectRoot(assemblyInput.entityRef);
        const assembler =
          this.deps.createAssembler?.(projectRoot) ??
          createDefaultCharacterProfileAssembler(projectRoot);
        return assembler.assembleProfile({
          ...assemblyInput,
          entityRef: this.normalizeEntityRef(assemblyInput.entityRef, projectRoot),
        });
      },
      collectEvidence: async (entityRef) => {
        const projectRoot = resolveProjectRoot(entityRef);
        const normalizedRef = this.normalizeEntityRef(entityRef, projectRoot);
        const reader = createDashboardCharacterProfileEvidenceReader(projectRoot);
        const [relationships, occurrences, representationHints, scriptContextFacts] =
          await Promise.all([
            reader.listRelationships(normalizedRef),
            reader.listOccurrences(normalizedRef),
            reader.listRepresentationHints(normalizedRef),
            reader.listScriptContextFacts(normalizedRef),
          ]);
        return {
          relationships,
          occurrences,
          representationHints,
          scriptContextFacts,
        };
      },
      loadEvidence: async (evidenceRequest) => {
        const projectRoot =
          evidenceRequest.projectRoot ?? resolveProjectRoot(evidenceRequest.entityRef);
        const normalizedRef = this.normalizeEntityRef(evidenceRequest.entityRef, projectRoot);
        return this.getEvidenceLoader(projectRoot).loadEvidence({
          ...evidenceRequest,
          entityRef: normalizedRef,
          projectRoot,
        });
      },
      runHeadlessDialogueProbe: async (probeInput) => {
        const projectRoot = resolveProjectRoot(probeInput.entityRef);
        const entityRef = this.normalizeEntityRef(probeInput.entityRef, projectRoot);
        return this.createRuntimeService().runHeadlessDialogueProbe({
          ...probeInput,
          entityRef,
          projectRoot,
        });
      },
      evaluateTranscript: async (evaluationInput) => {
        const artifact = await this.createRuntimeService().evaluateArtifact({
          artifact: evaluationInput.artifact,
          projectRoot: evaluationInput.projectRoot,
        });
        if (!artifact.evaluation) {
          throw new Error('Character Dialogue runtime returned an artifact without evaluation.');
        }
        return artifact.evaluation;
      },
      saveArtifact: async (saveInput) => {
        const save =
          this.deps.saveTranscriptArtifact ??
          ((artifactInput) => defaultSaveTranscriptArtifact(artifactInput));
        return save(saveInput);
      },
      applySuggestionWithConfirmation: (suggestionInput) =>
        this.applyEvaluationSuggestion(suggestionInput),
    };
  }

  async launchFromSlash(input: {
    readonly args?: string;
    readonly conversationId?: string;
  }): Promise<CharacterDialogueLaunchResult | null> {
    const projectRoot = this.deps.getProjectRoot();
    if (!projectRoot) {
      this.postGlobalError('请先打开工作区，再开始角色对话。');
      return null;
    }

    const parsed = parseCharacterDialogueSlashArgs(input.args);
    const entityRef =
      parsed.entityRef ??
      (parsed.entityToken
        ? await this.resolveEntityRef(parsed.entityToken, projectRoot)
        : await this.pickEntityRef(projectRoot));
    if (!entityRef) {
      this.postGlobalError('请先选择一个项目角色，再开始角色对话。');
      return null;
    }

    return this.launch({
      entityRef,
      source: 'slash-command',
      mode: parsed.mode,
      ...(parsed.enrichment ? { enrichment: parsed.enrichment } : {}),
      projectRoot,
      ...(parsed.initialUserMessage ? { initialUserMessage: parsed.initialUserMessage } : {}),
    });
  }

  dispose(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      void this.exit(sessionId, 'disposed');
    }
  }

  private createResponder(): CharacterDialogueResponder {
    return requireCharacterSemanticPort(
      this.deps.createResponder,
      'Character Dialogue responder',
    )();
  }

  private getEvidenceLoader(projectRoot: string): CharacterEvidenceLoader {
    return (
      this.deps.createEvidenceLoader?.(projectRoot) ??
      createDefaultCharacterEvidenceLoader(projectRoot)
    );
  }

  private resolveProjectRoot(request: NpcTestBenchLaunchRequest): string | undefined {
    return request.projectRoot ?? request.entityRef.projectRoot ?? this.deps.getProjectRoot();
  }

  private normalizeEntityRef(entityRef: CreativeEntityRef, projectRoot: string): CreativeEntityRef {
    return {
      ...entityRef,
      projectRoot,
      source: entityRef.source ?? 'neko-entity',
    };
  }

  private async resolveEntityRef(
    token: string,
    projectRoot: string,
  ): Promise<CreativeEntityRef | null> {
    const configured = await this.deps.resolveEntityRef?.({ token, projectRoot });
    if (configured) return this.normalizeEntityRef(configured, projectRoot);
    const normalized = normalizeMentionToken(token);
    if (!normalized) return null;

    const services = createVSCodeEntityServices({ projectRoot, logger });
    const entity = await services.service.resolveByName(normalized, 'character');
    if (entity) {
      return this.normalizeEntityRef(
        {
          entityId: entity.id,
          entityKind: entity.kind,
          projectRoot,
          source: 'neko-entity',
        },
        projectRoot,
      );
    }
    const candidate = (await services.service.listCandidates()).find(
      (item) =>
        item.id === normalized || item.name === normalized || item.aliases?.includes(normalized),
    );
    if (candidate) {
      return this.normalizeEntityRef(
        {
          entityId: candidate.resolvedEntityRef?.entityId ?? candidate.id,
          entityKind: candidate.kind,
          projectRoot,
          source: 'neko-entity',
        },
        projectRoot,
      );
    }
    const dashboardRef = await resolveDashboardEntityRefByToken(projectRoot, normalized);
    if (dashboardRef) return this.normalizeEntityRef(dashboardRef, projectRoot);
    return null;
  }

  private async pickEntityRef(projectRoot: string): Promise<CreativeEntityRef | null> {
    const configured = await this.deps.pickEntityRef?.({ projectRoot });
    if (configured) return this.normalizeEntityRef(configured, projectRoot);

    const services = createVSCodeEntityServices({ projectRoot, logger });
    const [entities, candidates] = await Promise.all([
      services.service.list({ kind: 'character' }),
      services.service.listCandidates('open'),
    ]);
    const localItems: NpcEntityQuickPickItem[] = [
      ...entities.map((entity) => ({
        label: entity.displayName ?? entity.canonicalName,
        description: entity.aliases.join(', '),
        aliases: entity.aliases,
        ref: {
          entityId: entity.id,
          entityKind: entity.kind,
          projectRoot,
          source: 'neko-entity',
        } satisfies CreativeEntityRef,
      })),
      ...candidates
        .filter((candidate) => candidate.kind === 'character')
        .map((candidate) => ({
          label: candidate.name,
          description: 'candidate',
          ref: {
            entityId: candidate.resolvedEntityRef?.entityId ?? candidate.id,
            entityKind: candidate.kind,
            projectRoot,
            source: 'neko-entity',
          } satisfies CreativeEntityRef,
        })),
    ];
    const dashboardItems = await loadDashboardNpcEntityPickerItems(projectRoot);
    const items = dedupeNpcEntityPickerItems([...localItems, ...dashboardItems]);
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要对话测试的项目角色',
      matchOnDescription: true,
    });
    return picked?.ref ?? null;
  }

  private markTabExited(sessionId: string): void {
    const tabState = this.deps.getTabState();
    const openTabs = tabState.openTabs.map((tab) =>
      tab.conversationId === sessionId && tab.characterDialogueSession
        ? {
            ...tab,
            characterDialogueSession: {
              ...tab.characterDialogueSession,
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
    (this.deps.logger ?? logger).warn('Character Dialogue launch failed', { message });
  }

  private readonly now = (): string => this.deps.now?.() ?? new Date().toISOString();
}

export function createDefaultCharacterProfileAssembler(
  projectRoot: string,
): CharacterProfileAssemblerPort {
  return {
    async assembleProfile(input): Promise<NpcProfileAssemblyResult> {
      const services = createVSCodeEntityServices({ projectRoot, logger });
      const evidenceReader = createDashboardCharacterProfileEvidenceReader(projectRoot);
      const dashboardEntityReader = createDashboardNpcEntityReader(projectRoot);
      const readers: NpcProfileAssemblerReaders = {
        getEntity: async (entityId) =>
          (await services.service.get(entityId)) ??
          (await dashboardEntityReader.getEntity({
            entityId,
            entityKind: input.entityRef.entityKind,
            projectRoot,
            ...(input.entityRef.source ? { source: input.entityRef.source } : {}),
          })),
        getCandidate: async (candidateId) =>
          (await services.service.listCandidates()).find(
            (candidate) => candidate.id === candidateId,
          ),
        listBindings: () => services.bindings.list(),
        listVisualDrafts: () => services.drafts.list(),
        listRelationships: (entityRef) => evidenceReader.listRelationships(entityRef),
        listOccurrences: (entityRef) => evidenceReader.listOccurrences(entityRef),
        listRepresentationHints: (entityRef) => evidenceReader.listRepresentationHints(entityRef),
      };
      const assembler = new NpcProfileAssembler(readers);
      const scriptContextFacts = await evidenceReader.listScriptContextFacts(input.entityRef);
      return assembler.assembleProfile({
        ...input,
        suggestedFacts: [...(input.suggestedFacts ?? []), ...scriptContextFacts],
      });
    },
  };
}

export interface CharacterProfileEvidenceReader {
  listRelationships(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityRelationshipProjection[]>;
  listOccurrences(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityOccurrenceProjection[]>;
  listRepresentationHints(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityRepresentationHint[]>;
  listScriptContextFacts(entityRef: CreativeEntityRef): Promise<readonly NpcProfileFact[]>;
}

export interface DefaultCharacterProfileEnrichmentInput extends NpcProfileEnrichmentInput {
  readonly now: () => string;
  readonly inferFacts?: (
    profile: NpcProfileSource,
    observedAt: string,
  ) => Promise<readonly NpcProfileFact[]>;
}

export function createDashboardCharacterProfileEvidenceReader(
  projectRoot: string,
): CharacterProfileEvidenceReader {
  const loadDetails = createDashboardCreativeEntityDetailLoader(projectRoot);
  return {
    async listRelationships(entityRef) {
      const details = await loadDetails(entityRef);
      return dedupeByKey(
        details.flatMap((detail) =>
          detail.relationships.map((relationship) =>
            dashboardRelationshipToProjection(entityRef, relationship, detail.ref),
          ),
        ),
        relationshipProjectionKey,
      );
    },
    async listOccurrences(entityRef) {
      const details = await loadDetails(entityRef);
      return dedupeByKey(
        details.flatMap((detail) =>
          detail.occurrences.map((occurrence) =>
            dashboardOccurrenceToProjection(entityRef, occurrence, detail.ref),
          ),
        ),
        occurrenceProjectionKey,
      );
    },
    async listRepresentationHints() {
      return [];
    },
    async listScriptContextFacts(entityRef) {
      const details = await loadDetails(entityRef);
      const snippets = await loadNpcScriptContextSnippets(projectRoot, details);
      return snippets.map((snippet) => ({
        key: `script.context.${snippet.index}`,
        value: snippet.text,
        source: 'script-extraction',
        authority: 'confirmed',
        sourceRef: snippet.location,
        providerId: snippet.source,
        metadata: {
          occurrenceLabel: snippet.label,
          ...(snippet.metadata ?? {}),
        },
      }));
    },
  };
}

export async function defaultEnrichCharacterProfile(
  input: DefaultCharacterProfileEnrichmentInput,
): Promise<NpcProfileEnrichmentResult> {
  const observedAt = input.now();
  const deterministicFacts = collectProjectEvidenceEnrichmentFacts(input.profile, observedAt);
  const inferredFacts = input.inferFacts
    ? await input.inferFacts(input.profile, observedAt)
    : [];
  const facts = mergeNpcProfileFacts(input.profile.facts, deterministicFacts, inferredFacts);
  return {
    profile: {
      ...input.profile,
      facts,
      sparsity: facts.length > input.profile.facts.length ? 'partial' : input.profile.sparsity,
      sparsityScore: projectEnrichedSparsityScore(input.profile, facts),
    },
  };
}

function collectProjectEvidenceEnrichmentFacts(
  profile: NpcProfileSource,
  observedAt: string,
): readonly NpcProfileFact[] {
  const facts: NpcProfileFact[] = [];
  for (const sample of profile.dialogueSamples ?? []) {
    facts.push({
      key: 'dialogue.sample',
      value: sample,
      source: 'script-extraction',
      authority: 'suggested',
      observedAt,
    });
  }
  for (const scene of profile.sceneAppearances ?? []) {
    facts.push({
      key: 'occurrence.sceneAppearance',
      value: scene,
      source: 'script-extraction',
      authority: 'suggested',
      observedAt,
    });
  }
  for (const relationship of profile.relationships ?? []) {
    facts.push({
      key: `relationship.suggested.${relationship.value.entityRef?.entityId ?? relationship.value.name}.${relationship.value.relation}`,
      value: serializeNpcRelationshipValue(relationship.value),
      source: 'relationship-graph',
      authority: 'suggested',
      ...(relationship.confidence !== undefined ? { confidence: relationship.confidence } : {}),
      ...(relationship.sourceRef ? { sourceRef: relationship.sourceRef } : {}),
      ...(relationship.providerId ? { providerId: relationship.providerId } : {}),
      observedAt,
    });
  }
  return facts;
}

function serializeNpcRelationshipValue(value: NpcProfileRelationshipValue): NpcSerializableValue {
  const serialized: Record<string, NpcSerializableValue> = {
    name: value.name,
    relation: value.relation,
  };
  if (value.summary) {
    serialized.summary = value.summary;
  }
  if (value.entityRef) {
    serialized.entityRef = serializeCreativeEntityRef(value.entityRef);
  }
  return serialized;
}

function serializeCreativeEntityRef(ref: CreativeEntityRef): NpcSerializableValue {
  const serialized: Record<string, NpcSerializableValue> = {
    entityId: ref.entityId,
    entityKind: ref.entityKind,
  };
  if (ref.projectRoot) {
    serialized.projectRoot = ref.projectRoot;
  }
  if (ref.source) {
    serialized.source = ref.source;
  }
  return serialized;
}

function mergeNpcProfileFacts(
  existing: readonly NpcProfileFact[],
  ...groups: readonly (readonly NpcProfileFact[])[]
): readonly NpcProfileFact[] {
  const facts: NpcProfileFact[] = [];
  const seen = new Set<string>();
  for (const fact of [...existing, ...groups.flat()]) {
    const key = `${fact.key}\u0000${JSON.stringify(fact.value)}\u0000${fact.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

function projectEnrichedSparsityScore(
  profile: NpcProfileSource,
  facts: readonly NpcProfileFact[],
): NpcProfileSource['sparsityScore'] {
  const confirmedFactCount = facts.filter((fact) => fact.authority === 'confirmed').length;
  const suggestedFactCount = facts.filter((fact) => fact.authority === 'suggested').length;
  const relationshipCount = profile.relationships?.length ?? 0;
  const dialogueSampleCount = profile.dialogueSamples?.length ?? 0;
  const score =
    (profile.sparsityScore?.score ?? (profile.sparsity === 'thin' ? 0.2 : 0.5)) +
    Math.min(
      0.35,
      suggestedFactCount * 0.05 + relationshipCount * 0.08 + dialogueSampleCount * 0.08,
    );
  const level = score < 0.34 ? 'thin' : score < 0.67 ? 'partial' : 'rich';
  return {
    level,
    score,
    confirmedFactCount,
    suggestedFactCount,
    relationshipCount,
    dialogueSampleCount,
    missingFactKeys: profile.sparsityScore?.missingFactKeys?.filter(
      (key) =>
        !(key === 'relationships' && relationshipCount > 0) &&
        !(key === 'dialogueSamples' && dialogueSampleCount > 0) &&
        !(key === 'sceneAppearances' && (profile.sceneAppearances?.length ?? 0) > 0),
    ),
  };
}

function createDashboardCreativeEntityDetailLoader(
  projectRoot: string,
): (entityRef: CreativeEntityRef) => Promise<readonly DashboardCreativeEntityDetail[]> {
  const detailByEntityId = new Map<string, Promise<readonly DashboardCreativeEntityDetail[]>>();
  return (entityRef) => {
    const existing = detailByEntityId.get(entityRef.entityId);
    if (existing) return existing;
    const promise = loadDashboardCreativeEntityDetails(projectRoot, entityRef);
    detailByEntityId.set(entityRef.entityId, promise);
    return promise;
  };
}

interface NpcScriptContextSnippet {
  readonly index: number;
  readonly text: string;
  readonly location: string;
  readonly label: string;
  readonly source: string;
  readonly metadata?: Readonly<Record<string, NpcSerializableValue>>;
}

const NPC_SCRIPT_CONTEXT_CHUNK_MAX_CHARS = 8000;

async function loadNpcScriptContextSnippets(
  projectRoot: string,
  details: readonly DashboardCreativeEntityDetail[],
): Promise<readonly NpcScriptContextSnippet[]> {
  const snippets: NpcScriptContextSnippet[] = [];
  const fileContexts = new Map<string, NpcScriptContextFileContext>();

  for (const detail of details) {
    for (const occurrence of detail.occurrences) {
      if (occurrence.source !== 'script') continue;

      const location = parseNpcScriptLocation(projectRoot, occurrence.location);
      if (!location) continue;

      const existing = fileContexts.get(location.filePath);
      if (existing) {
        existing.occurrences.push({
          line: location.line,
          location: occurrence.location,
          label: occurrence.label,
        });
        continue;
      }

      fileContexts.set(location.filePath, {
        filePath: location.filePath,
        relativePath: location.relativePath,
        source: detail.ref.source,
        occurrences: [
          {
            line: location.line,
            location: occurrence.location,
            label: occurrence.label,
          },
        ],
      });
    }
  }

  for (const context of fileContexts.values()) {
    const chunks = await readNpcScriptFileContext(context);
    for (const chunk of chunks) {
      snippets.push({
        index: snippets.length + 1,
        text: chunk.text,
        location: chunk.location,
        label: context.occurrences[0]?.label ?? '',
        source: context.source,
        metadata: {
          scriptFile: context.relativePath,
          lineRange: `${chunk.startLine}-${chunk.endLine}`,
          occurrenceLines: uniqueNumbers(context.occurrences.map((occurrence) => occurrence.line)),
          occurrenceLabels: uniqueStrings(
            context.occurrences.map((occurrence) => occurrence.label),
          ),
        },
      });
    }
  }

  return snippets;
}

interface ParsedNpcScriptLocation {
  readonly filePath: string;
  readonly relativePath: string;
  readonly line: number;
}

function parseNpcScriptLocation(
  projectRoot: string,
  location: string,
): ParsedNpcScriptLocation | null {
  const match = /^(.+):(\d+)(?::\d+)?$/.exec(location.trim());
  if (!match) return null;

  const relativePath = match[1];
  const line = Number.parseInt(match[2] ?? '', 10);
  if (!relativePath || !Number.isFinite(line) || line < 1) return null;
  if (path.isAbsolute(relativePath)) return null;
  if (!isSupportedNpcScriptContextFile(relativePath)) return null;

  const filePath = path.normalize(path.join(projectRoot, relativePath));
  if (!isPathInsideProject(projectRoot, filePath)) return null;
  return { filePath, relativePath: path.normalize(relativePath), line };
}

interface NpcScriptContextOccurrence {
  readonly line: number;
  readonly location: string;
  readonly label: string;
}

interface NpcScriptContextFileContext {
  readonly filePath: string;
  readonly relativePath: string;
  readonly source: string;
  readonly occurrences: NpcScriptContextOccurrence[];
}

interface NpcScriptContextChunk {
  readonly text: string;
  readonly location: string;
  readonly startLine: number;
  readonly endLine: number;
}

async function readNpcScriptFileContext(
  context: NpcScriptContextFileContext,
): Promise<readonly NpcScriptContextChunk[]> {
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(context.filePath));
    const text = Buffer.from(raw).toString('utf8');
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    return chunkNpcScriptFileContext(context, lines);
  } catch (error) {
    logger.debug('NPC script context unavailable', {
      filePath: context.filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function chunkNpcScriptFileContext(
  context: NpcScriptContextFileContext,
  lines: readonly string[],
): readonly NpcScriptContextChunk[] {
  const chunks: NpcScriptContextChunk[] = [];
  const occurrenceLines = uniqueNumbers(context.occurrences.map((occurrence) => occurrence.line));
  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentLength = 0;

  const flush = () => {
    if (currentLines.length === 0) return;
    const startLine = currentStartLine;
    const endLine = startLine + currentLines.length - 1;
    const header = [
      `Script file: ${context.relativePath}`,
      `Lines: ${startLine}-${endLine}`,
      `Character occurrence lines in this file: ${occurrenceLines.join(', ') || 'none'}`,
      'Full script context:',
    ].join('\n');
    const body = currentLines.join('\n').trimEnd();
    chunks.push({
      text: `${header}\n${body}`.trim(),
      location:
        chunks.length === 0 && context.occurrences.length === 1
          ? context.occurrences[0]!.location
          : `${context.relativePath}:${startLine}-${endLine}`,
      startLine,
      endLine,
    });
    currentLines = [];
    currentStartLine = endLine + 1;
    currentLength = 0;
  };

  lines.forEach((line, index) => {
    const numberedLine = `${index + 1}: ${line}`;
    if (
      currentLines.length > 0 &&
      currentLength + numberedLine.length + 1 > NPC_SCRIPT_CONTEXT_CHUNK_MAX_CHARS
    ) {
      flush();
    }
    if (currentLines.length === 0) {
      currentStartLine = index + 1;
    }
    currentLines.push(numberedLine);
    currentLength += numberedLine.length + 1;
  });
  flush();

  return chunks;
}

function isSupportedNpcScriptContextFile(filePath: string): boolean {
  return /\.(fountain|spmd|md|txt)$/i.test(filePath);
}

function isPathInsideProject(projectRoot: string, filePath: string): boolean {
  const relative = path.relative(projectRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function createDashboardNpcEntityReader(projectRoot: string): {
  getEntity(entityRef: CreativeEntityRef): Promise<CreativeEntity | undefined>;
} {
  const loadDetails = createDashboardCreativeEntityDetailLoader(projectRoot);
  return {
    async getEntity(entityRef) {
      const detail = (await loadDetails(entityRef)).find(
        (candidate) => candidate.kind === 'character',
      );
      return detail ? dashboardDetailToCreativeEntity(detail) : undefined;
    },
  };
}

async function resolveDashboardEntityRefByToken(
  projectRoot: string,
  token: string,
): Promise<CreativeEntityRef | null> {
  const items = await loadDashboardNpcEntityPickerItems(projectRoot);
  const normalizedToken = normalizeLookupText(token);
  const matched = items.find((item) =>
    itemLookupTokens(item).some((candidate) => normalizeLookupText(candidate) === normalizedToken),
  );
  return matched?.ref ?? null;
}

async function loadDashboardNpcEntityPickerItems(
  projectRoot: string,
): Promise<readonly NpcEntityQuickPickItem[]> {
  const sources = await loadDashboardCreativeEntitySources({ projectRoot });
  const items: NpcEntityQuickPickItem[] = [];

  for (const source of sources) {
    try {
      const snapshot = await source.getSnapshot();
      for (const row of snapshot.rows) {
        const ref = dashboardRowToNpcEntityRef(row, projectRoot);
        if (!ref) continue;
        items.push({
          label: row.label,
          description: dashboardPickerDescription(source, row),
          detail: row.summary,
          ref,
          ...(row.aliases ? { aliases: row.aliases } : {}),
        });
      }
    } catch (error) {
      logger.debug('NPC entity picker source unavailable', {
        source: source.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return items;
}

async function loadDashboardCreativeEntityDetails(
  projectRoot: string,
  entityRef: CreativeEntityRef,
): Promise<readonly DashboardCreativeEntityDetail[]> {
  const sources = await loadDashboardCreativeEntitySources({ projectRoot });
  const details: DashboardCreativeEntityDetail[] = [];
  for (const source of orderDashboardSourcesForEntityRef(sources, entityRef)) {
    const detail = await loadDashboardCreativeEntityDetailFromSource(
      source,
      projectRoot,
      entityRef,
    );
    if (detail) details.push(detail);
  }
  return details;
}

async function loadDashboardCreativeEntitySources(
  request: DashboardCreativeEntitySourceRequest,
): Promise<readonly DashboardCreativeEntitySource[]> {
  const commands = [
    DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
    DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  ] as const;
  const sources: DashboardCreativeEntitySource[] = [];

  for (const command of commands) {
    try {
      const candidate = await vscode.commands.executeCommand<unknown>(command, request);
      if (isDashboardCreativeEntitySource(candidate)) {
        sources.push(candidate);
      }
    } catch (error) {
      logger.debug('Character profile evidence source unavailable', {
        command,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return sources;
}

function orderDashboardSourcesForEntityRef(
  sources: readonly DashboardCreativeEntitySource[],
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntitySource[] {
  return [...sources].sort((left, right) => {
    const leftRank = sourceRankForEntityRef(left.source, entityRef);
    const rightRank = sourceRankForEntityRef(right.source, entityRef);
    return leftRank - rightRank || left.source.localeCompare(right.source);
  });
}

function sourceRankForEntityRef(source: string, entityRef: CreativeEntityRef): number {
  if (entityRef.source && source === entityRef.source) return 0;
  if (source === 'neko-story') return 1;
  if (source === 'neko-entity') return 2;
  return 3;
}

async function loadDashboardCreativeEntityDetailFromSource(
  source: DashboardCreativeEntitySource,
  projectRoot: string,
  entityRef: CreativeEntityRef,
): Promise<DashboardCreativeEntityDetail | undefined> {
  const candidates = dashboardRefsForNpcEntity(projectRoot, source.source, entityRef);
  for (const ref of candidates) {
    try {
      const detail = await source.getDetail(ref);
      if (isDashboardCreativeEntityDetail(detail)) {
        return detail;
      }
    } catch (error) {
      logger.debug('Character profile evidence detail unavailable', {
        source: source.source,
        entityId: entityRef.entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

function dashboardRefsForNpcEntity(
  projectRoot: string,
  source: string,
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntityRef[] {
  const base = {
    source,
    entityId: entityRef.entityId,
    entityKind: entityRef.entityKind,
  } satisfies Omit<DashboardCreativeEntityRef, 'sourceEntityId'>;
  return [
    { ...base, sourceEntityId: `entity:${entityRef.entityId}` },
    { ...base, sourceEntityId: entityRef.entityId },
    { ...base, sourceEntityId: `candidate:${entityRef.entityKind}:${entityRef.entityId}` },
  ];
}

function dashboardRelationshipToProjection(
  entityRef: CreativeEntityRef,
  relationship: DashboardCreativeEntityRelationshipSummary,
  sourceRef: DashboardCreativeEntityRef,
): CreativeEntityRelationshipProjection {
  const fromId = relationship.from || entityRef.entityId;
  const toId = relationship.to || entityRef.entityId;
  return {
    from: {
      entityId: fromId,
      entityKind: fromId === entityRef.entityId ? entityRef.entityKind : 'character',
      ...(entityRef.projectRoot ? { projectRoot: entityRef.projectRoot } : {}),
      source: sourceRef.source,
    },
    to: {
      entityId: toId,
      entityKind: toId === entityRef.entityId ? entityRef.entityKind : 'character',
      ...(entityRef.projectRoot ? { projectRoot: entityRef.projectRoot } : {}),
      source: sourceRef.source,
    },
    type: relationship.type,
    strength: relationship.strength,
    source: {
      sourceId: sourceRef.source,
      sourceKind: dashboardSourceKind(sourceRef.source),
      sourceRef: relationship.provenance,
      providerId: sourceRef.source,
      freshness: 'fresh',
    },
    ...(relationship.confidence !== undefined ? { confidence: relationship.confidence } : {}),
  };
}

function dashboardOccurrenceToProjection(
  entityRef: CreativeEntityRef,
  occurrence: DashboardCreativeEntityOccurrenceRef,
  sourceRef: DashboardCreativeEntityRef,
): CreativeEntityOccurrenceProjection {
  return {
    entityRef,
    label: occurrence.label,
    source: {
      sourceId: sourceRef.source,
      sourceKind: dashboardOccurrenceSourceKind(occurrence.source),
      sourceRef: occurrence.location,
      providerId: sourceRef.source,
      freshness: 'fresh',
    },
    role: occurrence.role,
    location: occurrence.location,
    ...(occurrence.detail !== undefined ? { detail: occurrence.detail } : {}),
  };
}

function dashboardOccurrenceSourceKind(
  source: DashboardCreativeEntityOccurrenceRef['source'],
): CreativeEntityOccurrenceProjection['source']['sourceKind'] {
  switch (source) {
    case 'registry':
      return 'registry';
    case 'script':
      return 'story';
    case 'asset':
      return 'asset';
    case 'generated-asset':
      return 'generated';
    case 'canvas':
    case 'canvas-comment':
    case 'canvas-container':
    case 'canvas-text':
      return 'canvas';
  }
}

function dashboardSourceKind(source: string): CreativeEntitySourceKind {
  if (source === 'neko-story') return 'story';
  if (source === 'neko-entity') return 'registry';
  if (source.includes('canvas')) return 'canvas';
  if (source.includes('asset')) return 'asset';
  return 'agent';
}

export function defaultCharacterEvidenceBudgetForMode(
  mode: 'character-dialogue' | 'embody-character' | 'character-validation',
): CharacterEvidenceBudget {
  switch (mode) {
    case 'character-validation':
      return {
        maxChunks: 12,
        maxCharacters: 18000,
        perChunkMaxCharacters: 3000,
        maxTokens: 4500,
      };
    case 'embody-character':
      return {
        maxChunks: 8,
        maxCharacters: 12000,
        perChunkMaxCharacters: 2500,
        maxTokens: 3000,
      };
    case 'character-dialogue':
      return {
        maxChunks: 8,
        maxCharacters: 12000,
        perChunkMaxCharacters: 2500,
        maxTokens: 3000,
      };
  }
}

function relationshipProjectionKey(relationship: CreativeEntityRelationshipProjection): string {
  return [
    relationship.from.entityId,
    relationship.to.entityId,
    relationship.type,
    relationship.source.sourceRef ?? '',
    relationship.source.providerId ?? '',
  ].join('\u0000');
}

function occurrenceProjectionKey(occurrence: CreativeEntityOccurrenceProjection): string {
  return [
    occurrence.entityRef?.entityId ?? '',
    occurrence.source.sourceRef ?? occurrence.location,
    occurrence.role,
    occurrence.label,
    occurrence.source.providerId ?? '',
  ].join('\u0000');
}

function dashboardDetailToCreativeEntity(detail: DashboardCreativeEntityDetail): CreativeEntity {
  return {
    id: dashboardRefEntityId(detail.ref),
    kind: 'character',
    canonicalName: detail.label,
    aliases: detail.aliases,
    status: detail.status === 'confirmed' ? 'confirmed' : 'candidate',
    metadata: {
      ...(detail.metadata ?? {}),
      dashboardSource: detail.ref.source,
      dashboardSourceEntityId: detail.ref.sourceEntityId,
      sourceKind: detail.sourceKind,
    },
  };
}

function dashboardRowToNpcEntityRef(
  row: DashboardCreativeEntityRow,
  projectRoot: string,
): CreativeEntityRef | null {
  if (row.kind !== 'character') return null;
  if (row.actions.some((action) => action.id === 'character-dialogue' && action.disabled)) {
    return null;
  }

  return {
    entityId: dashboardRefEntityId(row.ref),
    entityKind: 'character',
    projectRoot,
    source: row.ref.source,
  };
}

function dashboardRefEntityId(ref: DashboardCreativeEntityRef): string {
  return (
    ref.entityId ??
    readDashboardPrefixedId(ref.sourceEntityId, 'entity:') ??
    readDashboardPrefixedId(ref.sourceEntityId, `candidate:${ref.entityKind}:`) ??
    ref.sourceEntityId
  );
}

function readDashboardPrefixedId(value: string, prefix: string): string | undefined {
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}

function dashboardPickerDescription(
  source: DashboardCreativeEntitySource,
  row: DashboardCreativeEntityRow,
): string {
  return [
    row.status,
    source.sourceDisplayName ?? source.source,
    row.aliases && row.aliases.length > 0 ? row.aliases.join(', ') : undefined,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' · ');
}

function dedupeNpcEntityPickerItems(
  items: readonly NpcEntityQuickPickItem[],
): readonly NpcEntityQuickPickItem[] {
  const seen = new Set<string>();
  const deduped: NpcEntityQuickPickItem[] = [];
  for (const item of items) {
    const key = `${item.ref.entityKind}\u0000${item.ref.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function itemLookupTokens(item: NpcEntityQuickPickItem): readonly string[] {
  return [item.ref.entityId, item.label, ...(item.aliases ?? [])].filter((value): value is string =>
    Boolean(value?.trim()),
  );
}

function normalizeLookupText(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeByKey<T>(items: readonly T[], getKey: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort(
    (left, right) => left - right,
  );
}

function assertCharacterDialogueRouteNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('aborted');
  }
}

export function projectCharacterDialogueSession(
  session: Pick<
    CharacterDialogueSession,
    'id' | 'entityRef' | 'profileSnapshot' | 'mode' | 'status'
  >,
  input: { readonly projectRoot?: string; readonly startedAt: string },
): CharacterDialogueSessionProjection {
  return {
    sessionId: session.id,
    entityId: session.entityRef.entityId,
    displayName: session.profileSnapshot.displayName,
    mode: session.mode,
    profile: session.profileSnapshot,
    summary: summarizeCharacterProfile(session.profileSnapshot),
    startedAt: input.startedAt,
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
    status: session.status === 'disposed' ? 'exited' : 'active',
  };
}

export function resolveCharacterDialogueEntityRefFromSlashArgs(input: {
  readonly args?: string;
  readonly projectRoot?: string;
}): CreativeEntityRef | null {
  const parsed = parseCharacterDialogueSlashArgs(input.args);
  if (parsed.entityRef) {
    return parsed.entityRef;
  }
  if (!parsed.entityToken) {
    return null;
  }
  return {
    entityId: normalizeMentionToken(parsed.entityToken),
    entityKind: 'character',
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
    source: 'slash-command',
  };
}

export interface ParsedCharacterDialogueSlashArgs {
  readonly entityToken?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly mode: NpcTestMode;
  readonly enrichment?: NpcTestBenchLaunchRequest['enrichment'];
  readonly initialUserMessage?: string;
}

export function parseCharacterDialogueSlashArgs(
  args: string | undefined,
): ParsedCharacterDialogueSlashArgs {
  const tokens = tokenizeSlashArgs(args ?? '');
  let entityToken: string | undefined;
  let entityRef: CreativeEntityRef | undefined;
  let mode: NpcTestMode = 'roleplay';
  let enrichment: NpcTestBenchLaunchRequest['enrichment'];
  const messageParts: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--consult') {
      mode = 'consult';
      continue;
    }
    if (token === '--roleplay') {
      mode = 'roleplay';
      continue;
    }
    if (token.startsWith('--enrichment=')) {
      enrichment = parseEnrichmentMode(token.slice('--enrichment='.length));
      continue;
    }
    if (token === '--enrichment') {
      const next = tokens[index + 1];
      enrichment = parseEnrichmentMode(next);
      if (next && !next.startsWith('--')) {
        index += 1;
      }
      continue;
    }
    if (token === '--auto-enrich') {
      enrichment = 'auto';
      continue;
    }
    if (token === '--manual') {
      enrichment = 'manual';
      continue;
    }
    if (token === '--skip-enrich') {
      enrichment = 'skip';
      continue;
    }
    if (!entityToken && token.startsWith('@')) {
      entityToken = token;
      continue;
    }
    if (!entityToken && token.startsWith('entity:')) {
      entityToken = token;
      continue;
    }
    if (!entityRef && looksLikeCreativeEntityRef(token)) {
      const parsedRef = parseCreativeEntityRefJson(token);
      if (parsedRef) {
        entityRef = parsedRef;
        continue;
      }
    }
    messageParts.push(token);
  }

  return {
    ...(entityToken ? { entityToken } : {}),
    ...(entityRef ? { entityRef } : {}),
    mode,
    ...(enrichment ? { enrichment } : {}),
    ...(messageParts.length > 0 ? { initialUserMessage: messageParts.join(' ') } : {}),
  };
}

export function upsertCharacterRoleTab(openTabs: readonly OpenTab[], tab: OpenTab): OpenTab[] {
  return [...openTabs.filter((candidate) => candidate.id !== tab.id), tab];
}

async function defaultChooseThinProfileAction(
  profile: NpcProfileSource,
): Promise<NpcThinProfileAction> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: '直接开始',
        action: 'start-now' as const,
      },
      {
        label: '提取项目证据',
        action: 'enrich-project' as const,
      },
      {
        label: '手动补充',
        action: 'manual-supplement' as const,
      },
    ],
    {
      placeHolder: `${profile.displayName} 的 NPC 资料较少。`,
    },
  );
  return picked?.action ?? 'start-now';
}

async function defaultChooseTranscriptSavePolicy(
  input: NpcSavePolicyInput,
): Promise<NpcTranscriptSavePolicy> {
  if (input.reason === 'disposed') {
    return 'never';
  }
  const picked = await vscode.window.showInformationMessage(
    `Save Character Dialogue evidence for ${input.artifact.profileSnapshot.displayName}?`,
    'Save',
    'Discard',
  );
  return picked === 'Save' ? 'always' : 'never';
}

async function defaultSaveTranscriptArtifact(
  input: NpcTranscriptArtifactSaveInput,
): Promise<NpcTranscriptArtifactSaveResult> {
  const relativePath = buildNpcTranscriptArtifactRelativePath(input.artifact);
  const target = vscode.Uri.file(path.join(input.projectRoot, relativePath));
  const targetFsPath = target.fsPath ?? path.join(input.projectRoot, relativePath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetFsPath)));
  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(`${JSON.stringify(input.artifact, null, 2)}\n`, 'utf-8'),
  );
  return { path: relativePath };
}

function buildNpcTranscriptArtifactRelativePath(artifact: NpcTranscriptArtifact): string {
  const timestamp = artifact.createdAt.replace(/[:.]/g, '-');
  const entityId = artifact.entityRef.entityId.replace(/[^a-zA-Z0-9_.-]+/g, '-');
  return path.posix.join(CHARACTER_ROLE_TEST_ARTIFACT_DIR, `${entityId}-${timestamp}.json`);
}

async function defaultApplyCharacterSuggestion(
  input: NpcSuggestionApplyInput,
): Promise<NpcSuggestionApplyResult> {
  const { suggestion, projectRoot } = input;
  if (suggestion.applyTarget.kind === 'entity-metadata') {
    const services = createVSCodeEntityServices({ projectRoot, logger });
    await services.service.updateMetadata(suggestion.applyTarget.entityRef.entityId, {
      [suggestion.applyTarget.metadataKey]: suggestion.proposedValue,
    });
    return { applied: true };
  }

  if (suggestion.applyTarget.kind === 'relationship') {
    await vscode.commands.executeCommand('neko.entity.applyRelationshipSuggestion', {
      from: suggestion.applyTarget.from,
      to: suggestion.applyTarget.to,
      relationshipType: suggestion.applyTarget.relationshipType,
      proposedValue: suggestion.proposedValue,
      suggestionId: suggestion.id,
    });
    return { applied: true };
  }

  return {
    applied: false,
    message: 'Profile fact suggestions require an entity-owned apply command.',
  };
}

export function summarizeCharacterProfile(profile: NpcProfileSource): string {
  const facts = new Map(profile.facts.map((fact) => [fact.key, String(fact.value)]));
  return [
    facts.get('metadata.role'),
    facts.get('metadata.age') ?? facts.get('metadata.ageRange'),
    facts.get('metadata.personality'),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

export function createCharacterDialogueSessionId(entityRef: CreativeEntityRef): string {
  return createDefaultCharacterDialogueSessionId(entityRef);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireCharacterSemanticPort<T>(port: T | undefined, operation: string): T {
  if (!port) throw new Error(`${operation} requires an Agent semantic port.`);
  return port;
}

function tokenizeSlashArgs(input: string): string[] {
  return input.match(/"[^"]*"|'[^']*'|\S+/g)?.map(unquoteToken) ?? [];
}

function unquoteToken(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function normalizeMentionToken(token: string): string {
  return token.replace(/^@/, '').replace(/^entity:/, '');
}

function parseEnrichmentMode(value: string | undefined): NpcTestBenchLaunchRequest['enrichment'] {
  return value === 'ask' || value === 'skip' || value === 'auto' || value === 'manual'
    ? value
    : undefined;
}

function looksLikeCreativeEntityRef(value: string): boolean {
  return value.startsWith('{') && value.includes('entityId');
}

function parseCreativeEntityRefJson(value: string): CreativeEntityRef | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isCreativeEntityRef(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
