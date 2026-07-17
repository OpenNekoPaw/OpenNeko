/** Character-domain system prompt projection. */
import type { NpcProfileFact, NpcProfileSource, NpcTestMode } from '@neko/shared';

export interface CharacterDialogueProfilePromptOptions {
  readonly mode?: NpcTestMode;
  readonly locale?: string;
}

interface CharacterDialoguePromptLabels {
  readonly intro: (displayName: string) => string;
  readonly sessionMode: string;
  readonly roleplayMode: string;
  readonly consultMode: string;
  readonly boundaries: string;
  readonly boundaryLines: readonly string[];
  readonly identity: string;
  readonly name: string;
  readonly aliases: string;
  readonly none: string;
  readonly profileSparsity: string;
  readonly confirmedFacts: string;
  readonly suggestedFacts: string;
  readonly relationships: string;
  readonly dialogueSamples: string;
  readonly sceneAppearances: string;
  readonly representationBindings: string;
  readonly userSupplements: string;
  readonly confidence: string;
  readonly defaultBinding: string;
}

const EN_LABELS: CharacterDialoguePromptLabels = {
  intro: (displayName) => `You are ${displayName}.`,
  sessionMode: 'Session Mode',
  roleplayMode:
    'Roleplay mode: respond as the character in first person without narrating system instructions.',
  consultMode:
    'Consult mode: speak from the character perspective, but acknowledge when you are giving out-of-story advice.',
  boundaries: 'Boundaries',
  boundaryLines: [
    'Use only the profile facts below and the current conversation.',
    'Do not claim access to project files, tools, global memory, or hidden story context.',
    'If a fact is missing, stay in character and express uncertainty.',
    'Suggested facts are uncertain; do not present them as confirmed truth.',
  ],
  identity: 'Identity',
  name: 'Name',
  aliases: 'Aliases',
  none: 'None',
  profileSparsity: 'Profile sparsity',
  confirmedFacts: 'Confirmed Facts',
  suggestedFacts: 'Suggested / Uncertain Facts',
  relationships: 'Relationships',
  dialogueSamples: 'Dialogue Samples',
  sceneAppearances: 'Scene Appearances',
  representationBindings: 'Representation Bindings',
  userSupplements: 'User Supplements',
  confidence: 'confidence',
  defaultBinding: 'default',
};

const ZH_LABELS: CharacterDialoguePromptLabels = {
  intro: (displayName) => `你是 ${displayName}。`,
  sessionMode: '会话模式',
  roleplayMode: '角色扮演模式：以角色第一人称回应，不要叙述系统指令。',
  consultMode: '咨询模式：从角色视角发言，但在提供戏外建议时明确说明。',
  boundaries: '边界',
  boundaryLines: [
    '只使用下方角色档案事实和当前对话。',
    '不要声称可以访问项目文件、工具、全局记忆或隐藏剧情上下文。',
    '如果缺少事实，请保持角色状态并表达不确定性。',
    '建议事实是不确定的，不要把它们当作已确认真相。',
  ],
  identity: '身份',
  name: '姓名',
  aliases: '别名',
  none: '无',
  profileSparsity: '档案稀疏度',
  confirmedFacts: '已确认事实',
  suggestedFacts: '建议 / 不确定事实',
  relationships: '关系',
  dialogueSamples: '对白样例',
  sceneAppearances: '场景出现',
  representationBindings: '表现绑定',
  userSupplements: '用户补充',
  confidence: '置信度',
  defaultBinding: '默认',
};

export function projectCharacterDialogueSystemPrompt(
  source: NpcProfileSource,
  options: CharacterDialogueProfilePromptOptions = {},
): string {
  const mode = options.mode ?? 'roleplay';
  const labels = getCharacterDialoguePromptLabels(options.locale);
  const confirmedFacts = source.facts.filter((fact) => fact.authority === 'confirmed');
  const suggestedFacts = source.facts.filter((fact) => fact.authority === 'suggested');

  return [
    labels.intro(source.displayName),
    '',
    `## ${labels.sessionMode}`,
    mode === 'consult' ? labels.consultMode : labels.roleplayMode,
    '',
    `## ${labels.boundaries}`,
    ...labels.boundaryLines.map((line) => `- ${line}`),
    '',
    `## ${labels.identity}`,
    `${labels.name}: ${source.displayName}`,
    source.aliases.length > 0
      ? `${labels.aliases}: ${source.aliases.join(', ')}`
      : `${labels.aliases}: ${labels.none}`,
    `${labels.profileSparsity}: ${source.sparsity}`,
    '',
    renderFactSection(labels.confirmedFacts, confirmedFacts, labels),
    renderFactSection(labels.suggestedFacts, suggestedFacts, labels),
    renderRelationships(source, labels),
    renderListSection(labels.dialogueSamples, source.dialogueSamples, labels),
    renderListSection(labels.sceneAppearances, source.sceneAppearances, labels),
    renderRepresentationBindings(source, labels),
    source.userSupplements?.trim()
      ? `## ${labels.userSupplements}\n${source.userSupplements.trim()}`
      : `## ${labels.userSupplements}\n${labels.none}`,
  ].join('\n');
}

function renderFactSection(
  title: string,
  facts: readonly NpcProfileFact[],
  labels: CharacterDialoguePromptLabels,
): string {
  if (facts.length === 0) {
    return `## ${title}\n- ${labels.none}`;
  }
  return [`## ${title}`, ...facts.map((fact) => renderFact(fact, labels))].join('\n');
}

function renderFact(fact: NpcProfileFact, labels: CharacterDialoguePromptLabels): string {
  const confidence =
    fact.confidence === undefined
      ? ''
      : ` (${labels.confidence} ${Math.round(fact.confidence * 100)}%)`;
  const source = fact.sourceRef ? ` [${fact.source}: ${fact.sourceRef}]` : ` [${fact.source}]`;
  return `- ${fact.key}: ${formatValue(fact.value)}${confidence}${source}`;
}

function renderRelationships(
  source: NpcProfileSource,
  labels: CharacterDialoguePromptLabels,
): string {
  const relationships = source.relationships ?? [];
  if (relationships.length === 0) {
    return `## ${labels.relationships}\n- ${labels.none}`;
  }
  return [
    `## ${labels.relationships}`,
    ...relationships.map((relationship) => {
      const value = relationship.value;
      return `- ${value.name}: ${value.relation}${value.summary ? ` (${value.summary})` : ''}`;
    }),
  ].join('\n');
}

function renderListSection(
  title: string,
  values: readonly string[] | undefined,
  labels: CharacterDialoguePromptLabels,
): string {
  if (!values || values.length === 0) {
    return `## ${title}\n- ${labels.none}`;
  }
  return [`## ${title}`, ...values.map((value) => `- ${value}`)].join('\n');
}

function renderRepresentationBindings(
  source: NpcProfileSource,
  labels: CharacterDialoguePromptLabels,
): string {
  const bindings = source.representationBindings ?? [];
  if (bindings.length === 0) {
    return `## ${labels.representationBindings}\n- ${labels.none}`;
  }
  return [
    `## ${labels.representationBindings}`,
    ...bindings.map(
      (binding) =>
        `- ${binding.role}: ${binding.assetRef}${
          binding.isDefault ? ` (${labels.defaultBinding})` : ''
        }`,
    ),
  ].join('\n');
}

function getCharacterDialoguePromptLabels(
  locale: string | undefined,
): CharacterDialoguePromptLabels {
  return locale?.trim().toLowerCase().startsWith('zh') ? ZH_LABELS : EN_LABELS;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}
