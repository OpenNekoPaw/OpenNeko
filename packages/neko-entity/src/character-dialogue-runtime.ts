/** Character-domain dialogue lifecycle orchestration. */
import type {
  CreativeEntityRef,
  NpcEvaluationReport,
  NpcEvaluationSuggestion,
  NpcProfileSource,
  NpcTestBenchLaunchRequest,
  NpcTestMode,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
} from '@neko/shared';
import { NPC_TRANSCRIPT_ARTIFACT_VERSION } from '@neko/shared';
import {
  CharacterDialogueSession,
  type CharacterDialogueResponder,
} from './character-dialogue-session';
import type {
  CharacterEvidenceBudget,
  CharacterEvidenceBundle,
  CharacterEvidenceLoader,
  CharacterEvidenceRequest,
} from './character-evidence';

export type CharacterDialogueThinProfileAction =
  'start-now' | 'enrich-project' | 'manual-supplement';

export type CharacterDialogueTranscriptSavePolicy = 'ask' | 'always' | 'never';

export type CharacterDialogueSessionExitReason = 'user' | 'cancelled' | 'disposed';

export interface CharacterDialogueProfilePreparationInput {
  readonly profile: NpcProfileSource;
  readonly projectRoot: string;
  readonly request: NpcTestBenchLaunchRequest;
}

export type CharacterDialogueProfilePreparationResult =
  | {
      readonly status: 'ready';
      readonly profile: NpcProfileSource;
    }
  | {
      readonly status: 'cancelled';
      readonly message: string;
    };

export interface CharacterDialogueProfileEnrichmentInput extends CharacterDialogueProfilePreparationInput {}

export interface CharacterDialogueProfileEnrichmentResult {
  readonly profile: NpcProfileSource;
}

export interface CharacterDialogueManualSupplementInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
}

export interface CharacterDialogueEvaluationInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
}

export interface CharacterDialogueSavePolicyInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
  readonly reason: CharacterDialogueSessionExitReason;
}

export interface CharacterDialogueTranscriptArtifactSaveInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
}

export interface CharacterDialogueTranscriptArtifactSaveResult {
  readonly path: string;
}

export interface CharacterDialogueSuggestionApplyConfirmationInput {
  readonly suggestion: NpcEvaluationSuggestion;
  readonly projectRoot: string;
}

export interface CharacterDialogueSuggestionApplyInput {
  readonly suggestion: NpcEvaluationSuggestion;
  readonly projectRoot: string;
}

export interface CharacterDialogueSuggestionApplyResult {
  readonly applied: boolean;
  readonly message?: string;
}

export interface CharacterDialogueHeadlessProbeInput {
  readonly entityRef: CreativeEntityRef;
  readonly profile: NpcProfileSource;
  readonly messages: readonly string[];
  readonly mode?: NpcTestMode;
  readonly projectRoot?: string;
}

export interface CharacterDialogueRuntimeLogger {
  warn(message: string, meta?: Readonly<Record<string, unknown>>): void;
}

export type CharacterDialogueTranscriptEvaluator = (
  artifact: NpcTranscriptArtifact,
  options: { readonly locale?: string },
) => Promise<NpcEvaluationReport>;

export interface CharacterDialogueTranscriptEvaluatorOptions {
  readonly evaluator?: CharacterDialogueTranscriptEvaluator;
  readonly now?: () => string;
  readonly locale?: string;
}

export interface CharacterDialogueRuntimePorts {
  readonly createResponder: () => CharacterDialogueResponder;
  readonly createEvidenceLoader?: (projectRoot: string) => CharacterEvidenceLoader;
  readonly selectEvidenceBudget?: (
    mode: 'character-dialogue' | 'character-validation',
  ) => CharacterEvidenceBudget;
  readonly chooseThinProfileAction?: (
    input: CharacterDialogueProfilePreparationInput,
  ) => Promise<CharacterDialogueThinProfileAction>;
  readonly enrichProfile?: (
    input: CharacterDialogueProfileEnrichmentInput,
  ) => Promise<CharacterDialogueProfileEnrichmentResult>;
  readonly promptUserSupplement?: (
    input: CharacterDialogueManualSupplementInput,
  ) => Promise<string | undefined>;
  readonly evaluateTranscript?: (
    input: CharacterDialogueEvaluationInput,
  ) => Promise<NpcEvaluationReport>;
  readonly chooseSavePolicy?: (
    input: CharacterDialogueSavePolicyInput,
  ) => Promise<CharacterDialogueTranscriptSavePolicy>;
  readonly saveTranscriptArtifact?: (
    input: CharacterDialogueTranscriptArtifactSaveInput,
  ) => Promise<CharacterDialogueTranscriptArtifactSaveResult | null>;
  readonly confirmSuggestionApply?: (
    input: CharacterDialogueSuggestionApplyConfirmationInput,
  ) => Promise<boolean>;
  readonly applySuggestion?: (
    input: CharacterDialogueSuggestionApplyInput,
  ) => Promise<CharacterDialogueSuggestionApplyResult>;
}

export interface CharacterDialogueRuntimeServiceOptions {
  readonly ports: CharacterDialogueRuntimePorts;
  readonly locale?: string;
  readonly now?: () => string;
  readonly createSessionId?: (entityRef: CreativeEntityRef) => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly logger?: CharacterDialogueRuntimeLogger;
}

export interface CreateCharacterDialogueSessionInput {
  readonly entityRef: CreativeEntityRef;
  readonly profile: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly locale?: string;
}

export interface LoadCharacterDialogueTurnEvidenceInput {
  readonly session: CharacterDialogueSession;
  readonly projectRoot: string;
  readonly query: string;
  readonly mode: 'character-dialogue' | 'character-validation';
}

export class CharacterDialogueRuntimeService {
  private readonly ports: CharacterDialogueRuntimePorts;
  private readonly now: () => string;
  private readonly locale: string | undefined;
  private readonly createSessionId: (entityRef: CreativeEntityRef) => string;
  private readonly createMessageId:
    ((role: NpcTranscriptMessage['role'], turnIndex: number) => string) | undefined;
  private readonly logger: CharacterDialogueRuntimeLogger | undefined;

  constructor(options: CharacterDialogueRuntimeServiceOptions) {
    this.ports = options.ports;
    this.now = options.now ?? (() => new Date().toISOString());
    this.locale = options.locale;
    this.createSessionId = options.createSessionId ?? createDefaultCharacterDialogueSessionId;
    this.createMessageId = options.createMessageId;
    this.logger = options.logger;
  }

  async prepareProfileForLaunch(
    input: CharacterDialogueProfilePreparationInput,
  ): Promise<CharacterDialogueProfilePreparationResult> {
    if (input.profile.sparsity !== 'thin') {
      return { status: 'ready', profile: input.profile };
    }

    const action = await this.resolveThinProfileAction(input);
    if (action === 'start-now') {
      return { status: 'ready', profile: input.profile };
    }

    if (action === 'enrich-project') {
      const enriched = await this.ports.enrichProfile?.(input);
      return { status: 'ready', profile: enriched?.profile ?? input.profile };
    }

    const supplement = await this.ports.promptUserSupplement?.({
      projectRoot: input.projectRoot,
      profile: input.profile,
    });
    if (supplement === undefined) {
      return {
        status: 'cancelled',
        message: '角色对话已取消：未补充角色资料。',
      };
    }
    return {
      status: 'ready',
      profile: appendCharacterDialogueUserSupplement(input.profile, supplement),
    };
  }

  createSession(input: CreateCharacterDialogueSessionInput): CharacterDialogueSession {
    const locale = input.locale ?? this.locale;
    return new CharacterDialogueSession({
      id: this.createSessionId(input.entityRef),
      entityRef: input.entityRef,
      profileSnapshot: input.profile,
      mode: input.mode,
      responder: this.ports.createResponder(),
      ...(locale ? { locale } : {}),
      now: this.now,
      ...(this.createMessageId ? { createMessageId: this.createMessageId } : {}),
    });
  }

  async loadTurnEvidence(
    input: LoadCharacterDialogueTurnEvidenceInput,
  ): Promise<CharacterEvidenceBundle | undefined> {
    const loader = this.ports.createEvidenceLoader?.(input.projectRoot);
    if (!loader) return undefined;
    return this.safeLoadEvidence(loader, {
      entityRef: withProjectRoot(input.session.entityRef, input.projectRoot),
      mode: input.mode,
      query: input.query,
      projectRoot: input.projectRoot,
      budget: this.selectEvidenceBudget(input.mode),
      transcript: input.session.getTranscript(),
    });
  }

  async runHeadlessDialogueProbe(
    input: CharacterDialogueHeadlessProbeInput,
  ): Promise<NpcTranscriptArtifact> {
    const projectRoot = input.projectRoot ?? input.entityRef.projectRoot;
    const entityRef = projectRoot ? withProjectRoot(input.entityRef, projectRoot) : input.entityRef;
    const session = this.createSession({
      entityRef,
      profile: input.profile,
      mode: input.mode ?? 'roleplay',
      ...(this.locale ? { locale: this.locale } : {}),
    });

    try {
      for (const message of input.messages) {
        const turnEvidence = projectRoot
          ? await this.loadTurnEvidence({
              session,
              query: message,
              projectRoot,
              mode: 'character-validation',
            })
          : undefined;
        await session.sendUserMessage(message, {
          ...(turnEvidence ? { turnEvidence } : {}),
        });
      }
      return session.toArtifact();
    } finally {
      session.dispose();
    }
  }

  async evaluateArtifact(input: CharacterDialogueEvaluationInput): Promise<NpcTranscriptArtifact> {
    const evaluation =
      (await this.ports.evaluateTranscript?.(input)) ??
      createFallbackCharacterDialogueEvaluationReport(input.artifact, this.now());
    return { ...input.artifact, evaluation };
  }

  async maybeSaveArtifact(
    input: CharacterDialogueSavePolicyInput,
  ): Promise<CharacterDialogueTranscriptArtifactSaveResult | null> {
    const policy = (await this.ports.chooseSavePolicy?.(input)) ?? 'never';
    if (policy === 'never') return null;
    return (
      (await this.ports.saveTranscriptArtifact?.({
        artifact: input.artifact,
        projectRoot: input.projectRoot,
      })) ?? null
    );
  }

  async applySuggestionWithConfirmation(
    input: CharacterDialogueSuggestionApplyInput,
  ): Promise<CharacterDialogueSuggestionApplyResult> {
    const confirmed = (await this.ports.confirmSuggestionApply?.(input)) ?? false;
    if (!confirmed) {
      return { applied: false, message: 'Character suggestion was not confirmed.' };
    }
    return (
      (await this.ports.applySuggestion?.(input)) ?? {
        applied: false,
        message: 'No character suggestion apply port is available.',
      }
    );
  }

  private async resolveThinProfileAction(
    input: CharacterDialogueProfilePreparationInput,
  ): Promise<CharacterDialogueThinProfileAction> {
    const enrichment =
      input.request.enrichment ?? defaultCharacterDialogueEnrichmentForSource(input.request.source);
    switch (enrichment) {
      case 'skip':
        return 'start-now';
      case 'auto':
        return 'enrich-project';
      case 'manual':
        return 'manual-supplement';
      case 'ask':
      case undefined:
        return (await this.ports.chooseThinProfileAction?.(input)) ?? 'start-now';
    }
  }

  private async safeLoadEvidence(
    loader: CharacterEvidenceLoader,
    request: CharacterEvidenceRequest,
  ): Promise<CharacterEvidenceBundle | undefined> {
    try {
      return await loader.loadEvidence(request);
    } catch (error) {
      this.logger?.warn('Character evidence loading failed; continuing turn', {
        entityId: request.entityRef.entityId,
        mode: request.mode,
        error,
      });
      return undefined;
    }
  }

  private selectEvidenceBudget(
    mode: 'character-dialogue' | 'character-validation',
  ): CharacterEvidenceBudget {
    return (
      this.ports.selectEvidenceBudget?.(mode) ??
      (mode === 'character-validation'
        ? {
            maxChunks: 12,
            maxCharacters: 18000,
            perChunkMaxCharacters: 3000,
            maxTokens: 4500,
          }
        : {
            maxChunks: 8,
            maxCharacters: 12000,
            perChunkMaxCharacters: 2500,
            maxTokens: 3000,
          })
    );
  }
}

export function createCharacterDialogueRuntimeService(
  options: CharacterDialogueRuntimeServiceOptions,
): CharacterDialogueRuntimeService {
  return new CharacterDialogueRuntimeService(options);
}

export async function evaluateCharacterDialogueTranscript(
  artifact: NpcTranscriptArtifact,
  options: CharacterDialogueTranscriptEvaluatorOptions = {},
): Promise<NpcEvaluationReport> {
  const now = options.now ?? (() => new Date().toISOString());
  if (options.evaluator) {
    return options.evaluator(artifact, {
      ...(options.locale === undefined ? {} : { locale: options.locale }),
    });
  }

  return createFallbackCharacterDialogueEvaluationReport(artifact, now());
}

export function createFallbackCharacterDialogueEvaluationReport(
  artifact: NpcTranscriptArtifact,
  createdAt: string,
): NpcEvaluationReport {
  const hasNpcReply = artifact.transcript.some((message) => message.role === 'npc');
  const hasUserTurn = artifact.transcript.some((message) => message.role === 'user');
  return {
    version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
    createdAt,
    entityRef: artifact.entityRef,
    summary: hasNpcReply
      ? 'Character Dialogue transcript captured for project-scoped validation.'
      : 'Character Dialogue transcript has no character response to evaluate yet.',
    scores: [
      {
        dimension: 'persona-consistency',
        score: hasNpcReply ? 0.5 : 0,
        summary: hasNpcReply ? 'Manual review required.' : 'No character response was captured.',
      },
      {
        dimension: 'dialogue-voice-fit',
        score: hasUserTurn && hasNpcReply ? 0.5 : 0,
        summary: 'Fallback evaluation did not infer voice changes.',
      },
      {
        dimension: 'knowledge-boundary',
        score: 1,
        summary: 'Fallback evaluation found no automated knowledge leakage evidence.',
      },
    ],
    findings: [],
    suggestions: [],
  };
}

export function appendCharacterDialogueUserSupplement(
  profile: NpcProfileSource,
  supplement: string,
): NpcProfileSource {
  const trimmed = supplement.trim();
  if (!trimmed) return profile;
  return {
    ...profile,
    facts: [
      ...profile.facts,
      {
        key: 'userSupplement.notes',
        value: trimmed,
        source: 'user-supplement',
        authority: 'suggested',
      },
    ],
    userSupplements: [profile.userSupplements, trimmed]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n'),
  };
}

export function defaultCharacterDialogueEnrichmentForSource(
  source: NpcTestBenchLaunchRequest['source'],
): NpcTestBenchLaunchRequest['enrichment'] | undefined {
  return source === 'dashboard' ? 'skip' : undefined;
}

export function createDefaultCharacterDialogueSessionId(entityRef: CreativeEntityRef): string {
  const suffix = Date.now().toString(36);
  return `npc-${entityRef.entityId}-${suffix}`;
}

function withProjectRoot(entityRef: CreativeEntityRef, projectRoot: string): CreativeEntityRef {
  return {
    ...entityRef,
    projectRoot,
    source: entityRef.source ?? 'neko-entity',
  };
}
