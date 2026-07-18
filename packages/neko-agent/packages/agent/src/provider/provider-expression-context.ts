import type {
  ProviderCard,
  ProviderGenerationCapability,
  ProviderId,
  ProviderModelId,
  PromptFragment,
  StyleFamily,
} from '@neko/shared';

export type ProviderExpressionContextMode = 'selected' | 'candidates';
export type ProviderExpressionTaskStage = 'planning' | 'routing' | 'generation';
export type ProviderExpressionLocale = 'en' | 'zh';

export interface ProviderExpressionTarget {
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly capability?: ProviderGenerationCapability;
}

export interface ProviderExpressionContextOptions {
  readonly cards: readonly ProviderCard[];
  readonly maxCards?: number;
  readonly maxCardsPerCapability?: number;
  readonly maxContextTokens?: number;
  readonly estimateTokens?: (content: string) => number;
  readonly fragmentId?: string;
  readonly capability?: ProviderGenerationCapability;
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly preferredStyleFamily?: StyleFamily;
  readonly taskStage?: ProviderExpressionTaskStage;
  readonly mode?: ProviderExpressionContextMode;
  readonly locale?: string;
}

const DEFAULT_SELECTED_PROVIDER_CONTEXT_CARDS = 1;
const DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS = 6;
const DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS_PER_CAPABILITY = 2;

export function createProviderExpressionPromptFragments(
  options: ProviderExpressionContextOptions,
): readonly PromptFragment[] {
  const cards = selectProviderCards(options);
  if (cards.length === 0) {
    return [];
  }

  return [
    {
      id: options.fragmentId ?? 'provider:expression-context',
      priority: 68,
      content: renderProviderExpressionContext(cards, options.mode ?? 'selected', options),
    },
  ];
}

function selectProviderCards(options: ProviderExpressionContextOptions): readonly ProviderCard[] {
  const mode = options.mode ?? 'selected';
  const scored = options.cards
    .filter((card) => matchesCapability(card, options.capability))
    .filter((card) => matchesProviderTarget(card, options))
    .map((card) => ({ card, score: scoreProviderCard(card, options) }))
    .sort((left, right) => compareScoredProviderCards(left, right));

  if (mode === 'candidates' && !options.capability) {
    return selectCandidateCardsByCapability(scored, options);
  }

  const maxCards =
    options.maxCards ??
    (mode === 'candidates'
      ? DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS
      : DEFAULT_SELECTED_PROVIDER_CONTEXT_CARDS);
  return scored.slice(0, maxCards).map((entry) => entry.card);
}

function selectCandidateCardsByCapability(
  scored: readonly { readonly card: ProviderCard; readonly score: number }[],
  options: ProviderExpressionContextOptions,
): readonly ProviderCard[] {
  const maxCards = options.maxCards ?? DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS;
  const maxCardsPerCapability =
    options.maxCardsPerCapability ?? DEFAULT_CANDIDATE_PROVIDER_CONTEXT_CARDS_PER_CAPABILITY;
  const selected: ProviderCard[] = [];
  const counts = new Map<ProviderGenerationCapability, number>();

  for (const entry of scored) {
    const capability = entry.card.capabilities[0];
    if (!capability) continue;
    const count = counts.get(capability) ?? 0;
    if (count >= maxCardsPerCapability) continue;
    selected.push(entry.card);
    counts.set(capability, count + 1);
    if (selected.length >= maxCards) break;
  }

  return selected;
}

function compareScoredProviderCards(
  left: { readonly card: ProviderCard; readonly score: number },
  right: { readonly card: ProviderCard; readonly score: number },
): number {
  return right.score - left.score || compareProviderCards(left.card, right.card);
}

function compareProviderCards(left: ProviderCard, right: ProviderCard): number {
  return (
    left.providerId.localeCompare(right.providerId) ||
    (left.modelId ?? '').localeCompare(right.modelId ?? '')
  );
}

function matchesCapability(
  card: ProviderCard,
  capability: ProviderGenerationCapability | undefined,
): boolean {
  return !capability || card.capabilities.includes(capability);
}

function matchesProviderTarget(card: ProviderCard, target: ProviderExpressionTarget): boolean {
  if (target.providerId && card.providerId !== target.providerId) {
    return false;
  }
  if (target.modelId && card.modelId !== target.modelId) {
    return false;
  }
  return true;
}

function scoreProviderCard(card: ProviderCard, options: ProviderExpressionContextOptions): number {
  let score = card.sourceLayer === 'project' ? 3 : card.sourceLayer === 'personal' ? 2 : 1;
  if (options.providerId && card.providerId === options.providerId) {
    score += 8;
  }
  if (options.modelId && card.modelId === options.modelId) {
    score += 12;
  }
  if (options.capability && card.capabilities.includes(options.capability)) {
    score += 4;
  }
  const styleScore = options.preferredStyleFamily
    ? card.trainingProfile.styleAffinities[options.preferredStyleFamily]
    : undefined;
  if (typeof styleScore === 'number') {
    score += styleScore;
  }
  return score;
}

function renderProviderExpressionContext(
  cards: readonly ProviderCard[],
  mode: ProviderExpressionContextMode,
  options: ProviderExpressionContextOptions,
): string {
  const labels = getProviderExpressionLabels(options.locale);
  const lines = [
    labels.title,
    '',
    mode === 'selected' ? labels.selectedIntro : labels.candidatesIntro,
    labels.tendencyBoundary,
    labels.preserveIntent,
    labels.nativePromptFallback,
    '',
    ...cards.flatMap((card) =>
      renderProviderCardSummary(card, options.taskStage ?? defaultTaskStage(mode), labels),
    ),
  ];
  return applyTokenBudget(lines, options);
}

function renderProviderCardSummary(
  card: ProviderCard,
  taskStage: ProviderExpressionTaskStage,
  labels: ProviderExpressionLabels,
): readonly string[] {
  const commonLines = [
    `### ${card.displayName} (${formatProviderTarget(card)})`,
    `- ${labels.capabilities}: ${card.capabilities.join(', ')}`,
  ];

  if (taskStage === 'routing') {
    return [
      ...commonLines,
      ...renderStyleAffinities(card, labels),
      ...(card.trainingProfile.stylePrior
        ? [`- ${labels.stylePrior}: ${card.trainingProfile.stylePrior}`]
        : []),
      '',
    ];
  }

  if (taskStage === 'generation') {
    return [
      ...commonLines,
      ...(card.trainingProfile.descriptionDensity
        ? [`- ${labels.descriptionDensity}: ${card.trainingProfile.descriptionDensity}`]
        : []),
      ...(card.syntaxProfile.bestPhrasingPattern
        ? [`- ${labels.preferredPhrasing}: ${card.syntaxProfile.bestPhrasingPattern}`]
        : []),
      ...(card.syntaxProfile.supportsNegativePrompt !== undefined
        ? [
            `- ${labels.negativePromptSupport}: ${
              card.syntaxProfile.supportsNegativePrompt
                ? labels.negativePromptSupported
                : labels.negativePromptWeak
            }`,
          ]
        : []),
      ...(card.trainingProfile.spatialGrounding
        ? [`- ${labels.spatialGrounding}: ${card.trainingProfile.spatialGrounding}`]
        : []),
      ...renderSoftExpressionHints(card, labels),
      ...card.trainingProfile.antiBiasStrategies.map(
        (strategy) => `- ${labels.failureBiasNote}: ${strategy}`,
      ),
      '',
    ];
  }

  return [
    ...commonLines,
    ...(card.trainingProfile.stylePrior
      ? [`- ${labels.stylePrior}: ${card.trainingProfile.stylePrior}`]
      : []),
    ...renderStyleAffinities(card, labels),
    ...(card.trainingProfile.descriptionDensity
      ? [`- ${labels.descriptionDensity}: ${card.trainingProfile.descriptionDensity}`]
      : []),
    ...(card.syntaxProfile.bestPhrasingPattern
      ? [`- ${labels.preferredPhrasing}: ${card.syntaxProfile.bestPhrasingPattern}`]
      : []),
    ...card.trainingProfile.antiBiasStrategies.map(
      (strategy) => `- ${labels.failureBiasNote}: ${strategy}`,
    ),
    '',
  ];
}

function defaultTaskStage(mode: ProviderExpressionContextMode): ProviderExpressionTaskStage {
  return mode === 'candidates' ? 'routing' : 'generation';
}

interface ProviderExpressionLabels {
  readonly title: string;
  readonly selectedIntro: string;
  readonly candidatesIntro: string;
  readonly tendencyBoundary: string;
  readonly preserveIntent: string;
  readonly nativePromptFallback: string;
  readonly capabilities: string;
  readonly styleTendencies: string;
  readonly stylePrior: string;
  readonly descriptionDensity: string;
  readonly preferredPhrasing: string;
  readonly negativePromptSupport: string;
  readonly negativePromptSupported: string;
  readonly negativePromptWeak: string;
  readonly spatialGrounding: string;
  readonly softExpressionHint: string;
  readonly statusVerb: string;
  readonly possiblePhrasing: string;
  readonly hintSeparator: string;
  readonly failureBiasNote: string;
  readonly omissionLine: string;
}

function getProviderExpressionLabels(locale?: string): ProviderExpressionLabels {
  return normalizeProviderExpressionLocale(locale) === 'zh'
    ? ZH_PROVIDER_EXPRESSION_LABELS
    : EN_PROVIDER_EXPRESSION_LABELS;
}

function normalizeProviderExpressionLocale(locale?: string): ProviderExpressionLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const EN_PROVIDER_EXPRESSION_LABELS: ProviderExpressionLabels = {
  title: '## Provider Expression Context',
  selectedIntro:
    'Use this selected provider card as soft guidance for the current media generation target.',
  candidatesIntro:
    'Use these candidate provider cards only to choose a generation target or compare provider tendencies.',
  tendencyBoundary:
    'They are expression tendencies, failure modes, and examples — not deterministic replacement rules.',
  preserveIntent:
    'Do not silently replace user intent with card entries. Preserve the Plan/Task Markdown and user prompt as the source of truth.',
  nativePromptFallback:
    'If no provider-specific guidance is relevant, write a native provider prompt directly.',
  capabilities: 'Capabilities',
  styleTendencies: 'Style tendencies',
  stylePrior: 'Style prior',
  descriptionDensity: 'Description density',
  preferredPhrasing: 'Preferred phrasing',
  negativePromptSupport: 'Negative prompt support',
  negativePromptSupported: 'supported',
  negativePromptWeak: 'weak/unsupported',
  spatialGrounding: 'Spatial grounding',
  softExpressionHint: 'Soft expression hint',
  statusVerb: 'is',
  possiblePhrasing: 'possible phrasing',
  hintSeparator: '; ',
  failureBiasNote: 'Failure/bias note',
  omissionLine: '- Additional provider expression details omitted to stay within token budget.',
};

const ZH_PROVIDER_EXPRESSION_LABELS: ProviderExpressionLabels = {
  title: '## 供应方表达上下文',
  selectedIntro: '将这个已选供应方卡片作为当前媒体生成目标的软性指导。',
  candidatesIntro: '这些候选供应方卡片仅用于选择生成目标或比较供应方倾向。',
  tendencyBoundary: '它们描述表达倾向、失败模式和示例，不是确定性的替换规则。',
  preserveIntent: '不要静默用卡片条目替换用户意图。Plan/Task Markdown 和用户提示词是真实来源。',
  nativePromptFallback: '如果没有相关供应方指导，直接编写原生供应方提示词。',
  capabilities: '能力',
  styleTendencies: '风格倾向',
  stylePrior: '风格先验',
  descriptionDensity: '描述密度',
  preferredPhrasing: '推荐措辞',
  negativePromptSupport: '负向提示词支持',
  negativePromptSupported: '支持',
  negativePromptWeak: '较弱或不支持',
  spatialGrounding: '空间定位',
  softExpressionHint: '软性表达提示',
  statusVerb: '是',
  possiblePhrasing: '可选措辞',
  hintSeparator: '；',
  failureBiasNote: '失败/偏差提示',
  omissionLine: '- 更多供应方表达细节已省略以保持 token 预算。',
};

function formatProviderTarget(card: ProviderCard): string {
  return card.modelId ? `${card.providerId}/${card.modelId}` : card.providerId;
}

function renderStyleAffinities(
  card: ProviderCard,
  labels: ProviderExpressionLabels,
): readonly string[] {
  const entries = Object.entries(card.trainingProfile.styleAffinities)
    .filter(([, score]) => typeof score === 'number' && score > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? [
        `- ${labels.styleTendencies}: ${entries
          .map(([style, score]) => `${style}(${score})`)
          .join(', ')}`,
      ]
    : [];
}

function renderSoftExpressionHints(
  card: ProviderCard,
  labels: ProviderExpressionLabels,
): readonly string[] {
  return card.conceptCoverage.entries.slice(0, 8).map((entry) => {
    const hint = entry.expansion ? `${labels.possiblePhrasing}: ${entry.expansion}` : '';
    return `- ${labels.softExpressionHint}: ${entry.concept} ${labels.statusVerb} ${
      entry.status
    }${hint ? `${labels.hintSeparator}${hint}` : ''}`;
  });
}

function applyTokenBudget(
  lines: readonly string[],
  options: Pick<ProviderExpressionContextOptions, 'maxContextTokens' | 'estimateTokens' | 'locale'>,
): string {
  const maxTokens = options.maxContextTokens;
  if (!maxTokens || maxTokens <= 0) {
    return lines.join('\n');
  }

  const estimateTokens = options.estimateTokens ?? estimatePromptTokens;
  const selected: string[] = [];
  let omitted = false;

  for (const line of lines) {
    const candidate = [...selected, line].join('\n');
    if (estimateTokens(candidate) <= maxTokens) {
      selected.push(line);
      continue;
    }
    omitted = true;
    if (
      line.startsWith('### ') &&
      selected.some((selectedLine) => selectedLine.startsWith('### '))
    ) {
      break;
    }
  }

  if (!omitted) {
    return selected.join('\n');
  }

  const omissionLine = getProviderExpressionLabels(options.locale).omissionLine;
  const fallbackOmissionLine = fitLineToTokenBudget(omissionLine, maxTokens, estimateTokens);
  while (selected.length > 0) {
    const candidate = [...selected, omissionLine].join('\n');
    if (estimateTokens(candidate) <= maxTokens) {
      selected.push(omissionLine);
      break;
    }
    const fallbackCandidate = [...selected, fallbackOmissionLine].join('\n');
    if (estimateTokens(fallbackCandidate) <= maxTokens) {
      selected.push(fallbackOmissionLine);
      break;
    }
    selected.pop();
  }

  if (selected.length === 0) {
    return fallbackOmissionLine;
  }

  return selected.join('\n');
}

function fitLineToTokenBudget(
  line: string,
  maxTokens: number,
  estimateTokens: (content: string) => number,
): string {
  if (estimateTokens(line) <= maxTokens) {
    return line;
  }

  let candidate = line;
  while (candidate.length > 1 && estimateTokens(candidate) > maxTokens) {
    candidate = candidate.slice(0, -1);
  }
  return candidate || '…';
}

function estimatePromptTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
