/** Character-domain embodiment session. */
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  CreativeEntityRepresentationHint,
  NpcProfileFact,
  NpcProfileSource,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
} from '@neko/shared';
import { NPC_TRANSCRIPT_ARTIFACT_VERSION } from '@neko/shared';
import type { CharacterModelTier, CharacterToolPolicy } from './character-runtime-policy';
import { renderCharacterEvidenceBundle, type CharacterEvidenceBundle } from './character-evidence';

export type EmbodyCharacterFeedbackClassification =
  | 'confirmed'
  | 'inferred'
  | 'unknown'
  | 'out-of-scope'
  | 'mode-boundary';

export interface EmbodyCharacterCapabilityPolicy {
  readonly kind: 'character-feedback-readonly';
}

export interface EmbodyCharacterSessionConfig {
  readonly toolPolicy: CharacterToolPolicy;
  readonly capabilityPolicy: EmbodyCharacterCapabilityPolicy;
  readonly modelTier: CharacterModelTier;
  readonly maxIterations: number;
}

export interface EmbodyCharacterEvidenceSnapshot {
  readonly relationships: readonly CreativeEntityRelationshipProjection[];
  readonly occurrences: readonly CreativeEntityOccurrenceProjection[];
  readonly representationHints: readonly CreativeEntityRepresentationHint[];
  readonly scriptContextFacts: readonly NpcProfileFact[];
}

export interface EmbodyCharacterResponderInput {
  readonly sessionId: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly systemPrompt: string;
  readonly turnEvidence?: CharacterEvidenceBundle;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly userMessage: NpcTranscriptMessage;
  readonly config: EmbodyCharacterSessionConfig;
  readonly locale?: string;
  readonly signal: AbortSignal;
}

export interface EmbodyCharacterResponderResult {
  readonly content: string;
  readonly classifications?: readonly EmbodyCharacterFeedbackClassification[];
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type EmbodyCharacterResponder = (
  input: EmbodyCharacterResponderInput,
) => Promise<EmbodyCharacterResponderResult>;

export interface EmbodyCharacterSessionOptions {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly responder: EmbodyCharacterResponder;
  readonly systemPrompt?: string;
  readonly prompt?: string;
  readonly locale?: string;
  readonly config?: Partial<EmbodyCharacterSessionConfig>;
  readonly now?: () => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly seedTranscript?: readonly NpcTranscriptMessage[];
}

export interface EmbodyCharacterSendUserMessageOptions {
  readonly turnEvidence?: CharacterEvidenceBundle;
}

export interface EmbodyCharacterTurn {
  readonly sessionId: string;
  readonly userMessage: NpcTranscriptMessage;
  readonly feedbackMessage: NpcTranscriptMessage;
  readonly transcript: readonly NpcTranscriptMessage[];
}

export interface EmbodyCharacterSessionSnapshot {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly systemPrompt: string;
  readonly prompt?: string;
  readonly locale: string | undefined;
  readonly config: EmbodyCharacterSessionConfig;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly status: 'active' | 'disposed';
}

export const EMBODY_CHARACTER_DEFAULT_CONFIG: EmbodyCharacterSessionConfig = {
  toolPolicy: { kind: 'none' },
  capabilityPolicy: { kind: 'character-feedback-readonly' },
  modelTier: 'balanced',
  maxIterations: 8,
};

export const EMBODY_CHARACTER_BLOCKED_TOOL_NAMES = [
  'ActivateSkill',
  'DeactivateSkill',
  'Write',
  'Edit',
  'Bash',
  'CreateTask',
  'UpdateTask',
  'ApplyEntitySuggestion',
  'GenerateImage',
  'GenerateVideo',
  'GenerateAudio',
] as const;

export function isToolAllowedForEmbodyCharacter(toolName: string): boolean {
  return !EMBODY_CHARACTER_BLOCKED_TOOL_NAMES.includes(
    toolName as (typeof EMBODY_CHARACTER_BLOCKED_TOOL_NAMES)[number],
  );
}

export class EmbodyCharacterSession {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly systemPrompt: string;
  readonly prompt?: string;
  readonly locale: string | undefined;
  readonly config: EmbodyCharacterSessionConfig;

  private readonly responder: EmbodyCharacterResponder;
  private readonly now: () => string;
  private readonly createMessageId: (
    role: NpcTranscriptMessage['role'],
    turnIndex: number,
  ) => string;
  private readonly transcript: NpcTranscriptMessage[] = [];
  private activeTurn: AbortController | undefined;
  private turnIndex = 0;
  private disposed = false;

  constructor(options: EmbodyCharacterSessionOptions) {
    this.id = options.id;
    this.entityRef = options.entityRef;
    this.profileSnapshot = options.profileSnapshot;
    this.evidenceSnapshot = options.evidenceSnapshot;
    this.prompt = options.prompt;
    this.locale = options.locale;
    this.systemPrompt =
      options.systemPrompt ??
      projectEmbodyCharacterFeedbackPrompt({
        profile: options.profileSnapshot,
        evidence: options.evidenceSnapshot,
        prompt: options.prompt,
        locale: options.locale,
      });
    this.config = {
      ...EMBODY_CHARACTER_DEFAULT_CONFIG,
      ...(options.config ?? {}),
      toolPolicy: options.config?.toolPolicy ?? EMBODY_CHARACTER_DEFAULT_CONFIG.toolPolicy,
      capabilityPolicy:
        options.config?.capabilityPolicy ?? EMBODY_CHARACTER_DEFAULT_CONFIG.capabilityPolicy,
    };
    this.responder = options.responder;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createMessageId =
      options.createMessageId ??
      ((role, turnIndex) => `embody-character-msg-${this.id}-${turnIndex}-${role}`);
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
    options: EmbodyCharacterSendUserMessageOptions = {},
  ): Promise<EmbodyCharacterTurn> {
    this.assertActive();
    if (this.activeTurn) {
      throw new Error(`Embody Character session is already responding: ${this.id}`);
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Embody Character user message cannot be empty.');
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
        evidenceSnapshot: this.evidenceSnapshot,
        systemPrompt: buildEmbodyCharacterTurnSystemPrompt({
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
      const feedbackMessage: NpcTranscriptMessage = {
        id: this.createMessageId('evaluator', turnIndex),
        role: 'evaluator',
        content: result.content,
        createdAt: this.now(),
        turnIndex,
        speakerName: 'Character feedback',
        metadata: {
          capabilityPolicy: this.config.capabilityPolicy.kind,
          toolPolicy: this.config.toolPolicy.kind,
          ...(result.classifications ? { classifications: result.classifications.join(',') } : {}),
          ...(result.metadata ?? {}),
        },
      };
      this.transcript.push(feedbackMessage);

      return {
        sessionId: this.id,
        userMessage,
        feedbackMessage,
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
      mode: 'consult',
      profileSnapshot: this.profileSnapshot,
      transcript: this.getTranscript(),
      sessionId: this.id,
      ...(input.profileHash ? { profileHash: input.profileHash } : {}),
    };
  }

  snapshot(): EmbodyCharacterSessionSnapshot {
    return {
      id: this.id,
      entityRef: this.entityRef,
      profileSnapshot: this.profileSnapshot,
      evidenceSnapshot: this.evidenceSnapshot,
      systemPrompt: this.systemPrompt,
      ...(this.prompt ? { prompt: this.prompt } : {}),
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
      throw new Error(`Embody Character session has been disposed: ${this.id}`);
    }
  }
}

export function projectEmbodyCharacterFeedbackPrompt(input: {
  readonly profile: NpcProfileSource;
  readonly evidence: EmbodyCharacterEvidenceSnapshot;
  readonly prompt?: string;
  readonly locale?: string;
}): string {
  const zh = input.locale?.trim().toLowerCase().startsWith('zh') === true;
  const lines = zh
    ? [
        `你是 ${input.profile.displayName} 的只读角色代入反馈教练。`,
        '用户正在代入这个角色。你保持戏外视角，不能扮演、冒充或代替该角色说话。',
        '帮助用户理解他们正在代入谁、角色能知道什么，以及他们的扮演是否符合项目证据。',
        '像正常对话伙伴一样使用与用户相同的语言回答。保持简洁、直接、温和。',
        '默认使用第二人称说法，例如“你今天去了...”和“你遇到了...”，不要使用报告式标题或审计语言。',
        '不要每轮都重复代入身份。只有在身份问题、首轮澄清或用户明显困惑时，才说“你现在代入的是...”。',
        '不要用“已确认依据”“根据证据”“分类”或“评估”等标签开头。只有当证据、不确定性或矛盾会改变答案时才提及。',
        '简单知识问题优先用一个短段落回答。只有用户要求列表，或答案不列点就难以浏览时才使用项目符号。',
        '',
        '请求处理：',
        '- 身份/当前角色问题：简要说明用户代入的角色，然后回答实际问题。',
        '- 角色知识问题：先根据已加载项目证据回答问题；可能或未确认细节放在主答案之后简短限定。',
        '- 扮演一致性检查：用对话方式说明哪些符合、哪些不符合，并给出一两个小调整建议。',
        '- 创作执行或项目状态请求：不要写入、记录、创建、变更、生成媒体、激活技能、创建任务或保存日记。将请求重构为只读角色知识或一致性反馈。',
        '不要激活技能、写文件、变更角色设置、创建任务、生成媒体或记录日记。',
        '',
        '已确认事实：',
        ...formatFacts(input.profile.facts.filter((fact) => fact.authority === 'confirmed'), zh),
        '',
        '建议或推断事实：',
        ...formatFacts(input.profile.facts.filter((fact) => fact.authority === 'suggested'), zh),
        '',
        `可用关系数量：${input.evidence.relationships.length}。`,
        `可用出现记录数量：${input.evidence.occurrences.length}。`,
        `可用剧本上下文事实数量：${input.evidence.scriptContextFacts.length}。`,
        ...formatFacts(input.evidence.scriptContextFacts, zh),
      ]
    : [
        `You are a read-only character embodiment coach for ${input.profile.displayName}.`,
        'The user is embodying the character. You stay out-of-character and must not play, impersonate, or speak as the character.',
        'Help the user understand who they are embodying, what the character can know, and whether their roleplay fits project evidence.',
        'Answer like a normal conversation partner in the same language as the user. Be concise, direct, and warm.',
        'Default to second-person phrasing such as "你今天去了..." and "你遇到了...", not report-like headings or audit language.',
        'Do not repeat the embodied identity on every turn. Say "你现在代入的是..." only for identity questions, first-turn clarification, or when the user seems confused.',
        'Do not lead with labels such as "已确认依据", "根据证据", "分类", or "评估". Mention evidence, uncertainty, or contradictions only when it changes the answer.',
        'Prefer one short paragraph for simple knowledge questions. Use bullets only when the user asks for a list or the answer would otherwise be hard to scan.',
        '',
        'Request handling:',
        '- Identity/current-role questions: state the embodied character briefly, then answer the actual question.',
        '- Character knowledge questions: answer the question first from loaded project evidence; briefly qualify possible or unconfirmed details after the main answer.',
        '- Roleplay consistency checks: respond conversationally with what fits, what does not fit, and one or two small adjustment suggestions.',
        '- Creative execution or project-state requests: do not write, record, create, mutate, generate media, activate skills, create tasks, or save diary entries. Reframe the request as read-only role-knowledge or consistency feedback.',
        'Do not activate skills, write files, mutate character settings, create tasks, generate media, or record diary entries.',
        '',
        'Confirmed facts:',
        ...formatFacts(input.profile.facts.filter((fact) => fact.authority === 'confirmed'), zh),
        '',
        'Suggested or inferred facts:',
        ...formatFacts(input.profile.facts.filter((fact) => fact.authority === 'suggested'), zh),
        '',
        `Relationships available: ${input.evidence.relationships.length}.`,
        `Occurrences available: ${input.evidence.occurrences.length}.`,
        `Script context facts available: ${input.evidence.scriptContextFacts.length}.`,
        ...formatFacts(input.evidence.scriptContextFacts, zh),
      ];
  if (input.prompt?.trim()) {
    lines.push('', zh ? `用户设置说明：${input.prompt.trim()}` : `User setup note: ${input.prompt.trim()}`);
  }
  return lines.join('\n');
}

export function buildEmbodyCharacterTurnSystemPrompt(input: {
  readonly baseSystemPrompt: string;
  readonly turnEvidence?: CharacterEvidenceBundle;
  readonly locale?: string;
}): string {
  if (!input.turnEvidence) return input.baseSystemPrompt;
  const guidance =
    input.locale?.trim().toLowerCase().startsWith('zh') === true
      ? '仅将这些证据用于当前用户角色扮演回合的只读反馈。不要激活技能、变更项目状态，或声称可以访问已加载证据之外的项目文件。'
      : 'Use this evidence only for read-only feedback on the current user roleplay turn. Do not activate skills, mutate project state, or claim access to project files beyond the loaded evidence.';
  return [
    input.baseSystemPrompt,
    '',
    renderCharacterEvidenceBundle(input.turnEvidence, { locale: input.locale }),
    '',
    guidance,
  ].join('\n');
}

function formatFacts(facts: readonly NpcProfileFact[], zh = false): string[] {
  if (facts.length === 0) return [zh ? '- 无' : '- none'];
  return facts.slice(0, 24).map((fact) => `- ${fact.key}: ${JSON.stringify(fact.value)}`);
}
