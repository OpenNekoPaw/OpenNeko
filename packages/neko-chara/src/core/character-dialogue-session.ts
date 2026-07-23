import type {
  CreativeEntityRef,
  NpcProfileSource,
  NpcTestMode,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
} from '@neko/shared';
import { NPC_TRANSCRIPT_ARTIFACT_VERSION } from '@neko/shared';
import { projectCharacterDialogueSystemPrompt } from './character-dialogue-profile-projector';
import type { CharacterModelTier, CharacterToolPolicy } from './character-runtime-policy';
import { renderCharacterEvidenceBundle, type CharacterEvidenceBundle } from './character-evidence';

export interface CharacterDialogueSessionConfig {
  readonly toolPolicy: CharacterToolPolicy;
  readonly modelTier: CharacterModelTier;
  readonly maxIterations: number;
}

export interface CharacterDialogueResponderInput {
  readonly sessionId: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly systemPrompt: string;
  readonly turnEvidence?: CharacterEvidenceBundle;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly userMessage: NpcTranscriptMessage;
  readonly config: CharacterDialogueSessionConfig;
  readonly locale?: string;
  readonly signal: AbortSignal;
}

export interface CharacterDialogueResponderResult {
  readonly content: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type CharacterDialogueResponder = (
  input: CharacterDialogueResponderInput,
) => Promise<CharacterDialogueResponderResult>;

export interface CharacterDialogueSessionOptions {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly responder: CharacterDialogueResponder;
  readonly systemPrompt?: string;
  readonly config?: Partial<CharacterDialogueSessionConfig>;
  readonly locale?: string;
  readonly now?: () => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly seedTranscript?: readonly NpcTranscriptMessage[];
}

export interface CharacterDialogueSendUserMessageOptions {
  readonly turnEvidence?: CharacterEvidenceBundle;
}

export interface CharacterDialogueTurn {
  readonly sessionId: string;
  readonly userMessage: NpcTranscriptMessage;
  readonly npcMessage: NpcTranscriptMessage;
  readonly transcript: readonly NpcTranscriptMessage[];
}

export interface CharacterDialogueSessionSnapshot {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly systemPrompt: string;
  readonly locale: string | undefined;
  readonly config: CharacterDialogueSessionConfig;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly status: 'active' | 'disposed';
}

export const CHARACTER_DIALOGUE_DEFAULT_CONFIG: CharacterDialogueSessionConfig = {
  toolPolicy: { kind: 'none' },
  modelTier: 'balanced',
  maxIterations: 12,
};

export class CharacterDialogueSession {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly systemPrompt: string;
  readonly locale: string | undefined;
  readonly config: CharacterDialogueSessionConfig;

  private readonly responder: CharacterDialogueResponder;
  private readonly now: () => string;
  private readonly createMessageId: (
    role: NpcTranscriptMessage['role'],
    turnIndex: number,
  ) => string;
  private readonly transcript: NpcTranscriptMessage[] = [];
  private activeTurn: AbortController | undefined;
  private turnIndex = 0;
  private disposed = false;

  constructor(options: CharacterDialogueSessionOptions) {
    this.id = options.id;
    this.entityRef = options.entityRef;
    this.profileSnapshot = options.profileSnapshot;
    this.mode = options.mode;
    this.locale = options.locale;
    this.systemPrompt =
      options.systemPrompt ??
      projectCharacterDialogueSystemPrompt(options.profileSnapshot, {
        mode: options.mode,
        locale: options.locale,
      });
    this.config = {
      ...CHARACTER_DIALOGUE_DEFAULT_CONFIG,
      ...(options.config ?? {}),
      toolPolicy: options.config?.toolPolicy ?? CHARACTER_DIALOGUE_DEFAULT_CONFIG.toolPolicy,
    };
    this.responder = options.responder;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createMessageId =
      options.createMessageId ??
      ((role, turnIndex) => `character-dialogue-msg-${this.id}-${turnIndex}-${role}`);
    if (options.seedTranscript) {
      this.transcript.push(...options.seedTranscript);
      this.turnIndex = Math.max(
        0,
        ...options.seedTranscript.map((message) => message.turnIndex ?? 0),
      );
    }
  }

  get status(): 'active' | 'disposed' {
    return this.disposed ? 'disposed' : 'active';
  }

  async sendUserMessage(
    content: string,
    options: CharacterDialogueSendUserMessageOptions = {},
  ): Promise<CharacterDialogueTurn> {
    this.assertActive();
    if (this.activeTurn) {
      throw new Error(`Character Dialogue session is already responding: ${this.id}`);
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Character Dialogue user message cannot be empty.');
    }

    const turnIndex = ++this.turnIndex;
    const userMessage: NpcTranscriptMessage = {
      id: this.createMessageId('user', turnIndex),
      role: 'user',
      content: trimmed,
      createdAt: this.now(),
      turnIndex,
    };
    this.transcript.push(userMessage);

    const abortController = new AbortController();
    this.activeTurn = abortController;

    try {
      const result = await this.responder({
        sessionId: this.id,
        entityRef: this.entityRef,
        profileSnapshot: this.profileSnapshot,
        mode: this.mode,
        systemPrompt: buildCharacterDialogueTurnSystemPrompt({
          baseSystemPrompt: this.systemPrompt,
          turnEvidence: options.turnEvidence,
          locale: this.locale,
        }),
        ...(options.turnEvidence ? { turnEvidence: options.turnEvidence } : {}),
        transcript: this.getTranscript(),
        userMessage,
        config: this.config,
        ...(this.locale ? { locale: this.locale } : {}),
        signal: abortController.signal,
      });
      const npcMessage: NpcTranscriptMessage = {
        id: this.createMessageId('npc', turnIndex),
        role: 'npc',
        content: result.content,
        createdAt: this.now(),
        turnIndex,
        speakerName: this.profileSnapshot.displayName,
        ...(result.metadata ? { metadata: result.metadata } : {}),
      };
      this.transcript.push(npcMessage);

      return {
        sessionId: this.id,
        userMessage,
        npcMessage,
        transcript: this.getTranscript(),
      };
    } catch (error) {
      const failedUserMessageIndex = this.transcript.findIndex(
        (message) => message.id === userMessage.id,
      );
      if (failedUserMessageIndex >= 0) {
        this.transcript.splice(failedUserMessageIndex, 1);
      }
      throw error;
    } finally {
      this.activeTurn = undefined;
    }
  }

  getTranscript(): readonly NpcTranscriptMessage[] {
    return this.transcript.map((message) => ({ ...message }));
  }

  toArtifact(
    input: { readonly createdAt?: string; readonly profileHash?: string } = {},
  ): NpcTranscriptArtifact {
    return {
      version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
      createdAt: input.createdAt ?? this.now(),
      entityRef: this.entityRef,
      mode: this.mode,
      profileSnapshot: this.profileSnapshot,
      transcript: this.getTranscript(),
      sessionId: this.id,
      ...(input.profileHash ? { profileHash: input.profileHash } : {}),
    };
  }

  snapshot(): CharacterDialogueSessionSnapshot {
    return {
      id: this.id,
      entityRef: this.entityRef,
      profileSnapshot: this.profileSnapshot,
      mode: this.mode,
      systemPrompt: this.systemPrompt,
      locale: this.locale,
      config: this.config,
      transcript: this.getTranscript(),
      status: this.status,
    };
  }

  cancel(): void {
    this.activeTurn?.abort();
    this.activeTurn = undefined;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Character Dialogue session has been disposed: ${this.id}`);
    }
  }
}

export function buildCharacterDialogueTurnSystemPrompt(input: {
  readonly baseSystemPrompt: string;
  readonly turnEvidence?: CharacterEvidenceBundle;
  readonly locale?: string;
}): string {
  if (!input.turnEvidence) return input.baseSystemPrompt;
  const guidance =
    input.locale?.trim().toLowerCase().startsWith('zh') === true
      ? '仅将这些证据用于当前角色会话回合。不要声称可以访问项目文件、工具、全局记忆或未提供的证据。'
      : 'Use this evidence only for the current role-session turn. Do not claim access to project files, tools, global memory, or omitted evidence.';
  return [
    input.baseSystemPrompt,
    '',
    renderCharacterEvidenceBundle(input.turnEvidence, { locale: input.locale }),
    '',
    guidance,
  ].join('\n');
}
