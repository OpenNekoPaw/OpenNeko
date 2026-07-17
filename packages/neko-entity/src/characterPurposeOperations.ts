import {
  isNpcEvaluationReport,
  isNpcSerializableValue,
  type ICapabilityPurposeTextRuntime,
  type NpcEvaluationReport,
  type NpcProfileFact,
  type NpcProfileSource,
  type NpcTranscriptArtifact,
  type NpcTranscriptMessage,
} from '@neko/shared';

export function requireCharacterPurposeRuntime(
  runtime: ICapabilityPurposeTextRuntime | undefined,
  operation: string,
): ICapabilityPurposeTextRuntime {
  if (!runtime) throw new Error(`${operation} requires the product purpose text runtime.`);
  return runtime;
}

export function createCharacterDialoguePurposeResponder(runtime: ICapabilityPurposeTextRuntime) {
  return async (input: {
    readonly systemPrompt: string;
    readonly transcript: readonly NpcTranscriptMessage[];
    readonly config: { readonly toolPolicy: { readonly kind: string } };
    readonly signal: AbortSignal;
  }) => {
    const completion = await runtime.complete({
      purpose: 'character.dialogue',
      instruction: input.systemPrompt,
      input: projectCharacterTranscript(input.transcript),
      signal: input.signal,
    });
    return {
      content: completion.text,
      metadata: { toolPolicy: input.config.toolPolicy.kind },
    };
  };
}

export function createEmbodyCharacterPurposeResponder(runtime: ICapabilityPurposeTextRuntime) {
  return async (input: {
    readonly systemPrompt: string;
    readonly transcript: readonly NpcTranscriptMessage[];
    readonly config: {
      readonly toolPolicy: { readonly kind: string };
      readonly capabilityPolicy: { readonly kind: string };
    };
    readonly signal: AbortSignal;
  }) => {
    const completion = await runtime.complete({
      purpose: 'character.dialogue',
      instruction: input.systemPrompt,
      input: projectCharacterTranscript(input.transcript),
      signal: input.signal,
    });
    return {
      content: completion.text,
      metadata: {
        toolPolicy: input.config.toolPolicy.kind,
        capabilityPolicy: input.config.capabilityPolicy.kind,
      },
    };
  };
}

export async function evaluateCharacterDialogueWithPurpose(
  runtime: ICapabilityPurposeTextRuntime,
  artifact: NpcTranscriptArtifact,
  locale?: string,
): Promise<NpcEvaluationReport> {
  const prompts = projectCharacterRoleEvaluationPrompt(artifact, { locale });
  const completion = await runtime.complete({
    purpose: 'character.profile',
    instruction: prompts.instruction,
    input: prompts.input,
  });
  const parsed = parseCharacterRoleEvaluationReportOutput(completion.text);
  if (parsed.status === 'invalid') {
    throw new Error(`Character profile evaluation returned invalid output: ${parsed.reason}`);
  }
  return parsed.report;
}

export async function inferCharacterProfileFactsWithPurpose(
  runtime: ICapabilityPurposeTextRuntime,
  profile: NpcProfileSource,
  observedAt: string,
): Promise<readonly NpcProfileFact[]> {
  if (!hasProjectEvidenceForInference(profile)) return [];
  const completion = await runtime.complete({
    purpose: 'character.profile',
    instruction: [
      'Extract tentative character profile facts from project-scoped evidence.',
      'Return JSON only: an array of objects with key, value, confidence, and optional label.',
      'Only infer personality, speechPattern, catchphrase, goals, or relationshipNotes when directly supported by the evidence.',
      'Do not invent biography, hidden story context, project files, tools, or global memory.',
    ].join('\n'),
    input: JSON.stringify(
      {
        entityRef: profile.entityRef,
        displayName: profile.displayName,
        aliases: profile.aliases,
        confirmedFacts: profile.facts.filter((fact) => fact.authority === 'confirmed'),
        dialogueSamples: profile.dialogueSamples ?? [],
        sceneAppearances: profile.sceneAppearances ?? [],
        relationships: profile.relationships ?? [],
      },
      null,
      2,
    ),
  });
  return parseNpcProfileEnrichmentFacts(completion.text, observedAt);
}

export function projectCharacterRoleEvaluationPrompt(
  artifact: NpcTranscriptArtifact,
  options: { readonly locale?: string } = {},
): { readonly instruction: string; readonly input: string } {
  const zh = options.locale?.trim().toLowerCase().startsWith('zh') === true;
  return {
    instruction: zh
      ? [
          '你需要根据提供的角色档案快照评估角色对话转录。',
          '只返回 JSON，结构必须符合 NpcEvaluationReport。',
          '标记人设一致性、对白声线匹配、知识边界泄露、关系缺口和角色档案改进建议。',
          '所有建议必须保持 suggested 状态，并且在任何实体变更前都需要用户明确确认。',
        ].join('\n')
      : [
          'You evaluate character role transcripts against the supplied profile snapshot.',
          'Return JSON only, shaped as NpcEvaluationReport.',
          'Flag persona consistency issues, dialogue voice fit, knowledge leakage, relationship gaps, and profile improvement suggestions.',
          'Suggestions must remain suggested and require explicit user confirmation before any entity mutation.',
        ].join('\n'),
    input: [
      zh ? '## 角色档案快照' : '## Profile Snapshot',
      JSON.stringify(artifact.profileSnapshot, null, 2),
      '',
      zh ? '## 对话转录' : '## Transcript',
      JSON.stringify(artifact.transcript, null, 2),
      '',
      zh ? '## 期望 JSON 结构' : '## Expected JSON Shape',
      JSON.stringify(
        {
          version: 1,
          createdAt: 'ISO timestamp',
          entityRef: artifact.entityRef,
          summary: zh ? '简短评估摘要' : 'short evaluation summary',
          scores: [{ dimension: 'persona-consistency', score: 0.8, summary: 'reason' }],
          findings: [],
          suggestions: [],
        },
        null,
        2,
      ),
    ].join('\n'),
  };
}

export type CharacterRoleEvaluationReportParseResult =
  | { readonly status: 'parsed'; readonly report: NpcEvaluationReport }
  | { readonly status: 'invalid'; readonly reason: string };

export function parseCharacterRoleEvaluationReportOutput(
  output: string,
): CharacterRoleEvaluationReportParseResult {
  const json = extractJsonValuePayload(output);
  if (!json) return { status: 'invalid', reason: 'Evaluator output did not contain JSON.' };
  try {
    const parsed: unknown = JSON.parse(json);
    return isNpcEvaluationReport(parsed)
      ? { status: 'parsed', report: parsed }
      : { status: 'invalid', reason: 'Evaluator JSON did not match NpcEvaluationReport.' };
  } catch (error) {
    return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }
}

function projectCharacterTranscript(transcript: readonly NpcTranscriptMessage[]): string {
  const prompt = transcript
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .join('\n\n')
    .trim();
  if (!prompt) throw new Error('Character dialogue requires a non-empty transcript.');
  return prompt;
}

function hasProjectEvidenceForInference(profile: NpcProfileSource): boolean {
  return Boolean(
    (profile.dialogueSamples?.length ?? 0) > 0 ||
    (profile.sceneAppearances?.length ?? 0) > 0 ||
    (profile.relationships?.length ?? 0) > 0,
  );
}

function parseNpcProfileEnrichmentFacts(
  output: string,
  observedAt: string,
): readonly NpcProfileFact[] {
  const json = extractJsonValuePayload(output);
  if (!json) throw new Error('Character profile enrichment output did not contain JSON.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error('Character profile enrichment output contained invalid JSON.', {
      cause: error,
    });
  }
  if (!Array.isArray(parsed))
    throw new Error('Character profile enrichment output must be an array.');
  return parsed.map((item, index): NpcProfileFact => {
    if (!isRecord(item)) throw new Error(`Character profile enrichment item ${index} is invalid.`);
    const key = typeof item['key'] === 'string' ? item['key'].trim() : '';
    if (!key || !isNpcSerializableValue(item['value'])) {
      throw new Error(`Character profile enrichment item ${index} has an invalid key or value.`);
    }
    const confidence = readConfidence(item['confidence']);
    return {
      key: key.startsWith('agent.') ? key : `agent.${key}`,
      value: item['value'],
      source: 'agent-inferred',
      authority: 'suggested',
      ...(confidence === undefined ? {} : { confidence }),
      ...(typeof item['label'] === 'string' && item['label'].trim()
        ? { label: item['label'].trim() }
        : {}),
      observedAt,
    };
  });
}

function extractJsonValuePayload(output: string): string | undefined {
  const trimmed = output.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  if (fenced) return fenced;
  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  const array = firstArray >= 0 && (firstObject < 0 || firstArray < firstObject);
  const start = array ? firstArray : firstObject;
  const end = array ? trimmed.lastIndexOf(']') : trimmed.lastIndexOf('}');
  return start < 0 || end <= start ? undefined : trimmed.slice(start, end + 1);
}

function readConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
