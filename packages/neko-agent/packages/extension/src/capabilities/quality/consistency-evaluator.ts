/**
 * ConsistencyEvaluator — Cross-scene visual consistency analysis
 *
 * Two-layer evaluation:
 *   Layer 1 (fast): CLIP embedding similarity on adjacent scene pairs
 *   Layer 2 (precise): Vision LLM pairwise comparison for low-scoring pairs
 *
 * Dependencies are injected via ConsistencyEvaluatorDeps, keeping this module
 * model-agnostic and free of vscode/extension imports.
 */

import type { ConsistencyReport, StyleDriftPair, CharacterAppearance } from '@neko/shared';
import { isExplicitChatRoutingError } from './chat-routing-error';

// =============================================================================
// Interfaces (injected dependencies)
// =============================================================================

/** CLIP similarity scorer — pre-bound to a specific model */
export interface IClipScorer {
  score(imagePath: string, text: string): Promise<number>;
}

/** LLM service for multimodal chat. */
export interface ConsistencyLLMService {
  chat(
    messages: unknown[],
    options?: { maxTokens?: number; providerId?: string; modelId?: string },
  ): Promise<{ message: { content: string | unknown[] } }>;
}

export interface ConsistencyChatModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

/** Frame extractor for video scenes */
export interface ConsistencyFrameExtractor {
  extractFrame(source: string, time: number): Promise<string | null>;
  probe(source: string): Promise<{ duration: number; fps: number; width: number; height: number }>;
}

export interface ConsistencyEvaluatorDeps {
  createService: () => ConsistencyLLMService;
  chatModel?: ConsistencyChatModelRef;
  locale?: string;
  /** Optional CLIP scorer — when absent, all pairs go to LLM layer 2 */
  clipScorer?: IClipScorer;
  /** Optional frame extractor — when absent, video scenes are skipped */
  frameExtractor?: ConsistencyFrameExtractor;
}

export interface ConsistencyInput {
  sceneIndex: number;
  mediaPath: string;
  prompt: string;
}

export interface CharacterRef {
  name: string;
  description: string;
  referenceImagePath?: string;
}

export interface ConsistencyContext {
  globalStyle?: string;
  characters?: CharacterRef[];
}

// =============================================================================
// Constants
// =============================================================================

/** CLIP drift threshold — pairs below this skip LLM layer 2 (0-100 scale) */
const CLIP_DRIFT_THRESHOLD = 15;

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);

const PAIRWISE_SYSTEM_PROMPT = `You are a visual consistency evaluator for AI-generated media sequences.
Compare the two provided images from adjacent scenes of the same production.

Evaluate visual consistency across these dimensions:
1. Color palette and grading consistency
2. Lighting direction and quality
3. Art style / rendering technique consistency
4. Character appearance (if characters present)
5. Environmental continuity (shared elements)

Return ONLY valid JSON:
{
  "driftScore": <0-100, 0=identical style, 100=completely different>,
  "description": "<concise description of style differences>",
  "characterIssues": [
    { "name": "<character>", "issue": "<description>" }
  ]
}

Only report actual inconsistencies. Empty characterIssues array is valid if characters are consistent.`;

const PAIRWISE_SYSTEM_PROMPT_ZH = `你是 AI 生成媒体序列的视觉一致性评估器。
请比较同一作品中相邻场景的两张图像。

从以下维度评估视觉一致性：
1. 色彩 palette 和调色一致性
2. 光线方向和质量
3. 美术风格 / 渲染技法一致性
4. 角色外观（如果有角色）
5. 环境连续性（共享元素）

只返回有效 JSON：
{
  "driftScore": <0-100, 0=identical style, 100=completely different>,
  "description": "<concise description of style differences>",
  "characterIssues": [
    { "name": "<character>", "issue": "<description>" }
  ]
}

只报告真实不一致。若角色一致，characterIssues 可以为空数组。`;

const CHARACTER_SYSTEM_PROMPT = `You are evaluating character appearance consistency across scenes.
Compare the character in the current scene image against the reference image.

Return ONLY valid JSON:
{
  "score": <0-100, 100=perfectly consistent, 0=completely different character>,
  "issues": ["<specific inconsistency descriptions>"]
}

Focus on: face/body shape, clothing, hair color/style, distinctive features.
Empty issues array means the character is consistent.`;

const CHARACTER_SYSTEM_PROMPT_ZH = `你正在评估跨场景的角色外观一致性。
请将当前场景图像中的角色与参考图像进行比较。

只返回有效 JSON：
{
  "score": <0-100, 100=perfectly consistent, 0=completely different character>,
  "issues": ["<specific inconsistency descriptions>"]
}

重点关注：脸型/体型、服装、发色/发型、辨识特征。
空 issues 数组表示角色一致。`;

function getPairwiseConsistencySystemPrompt(locale: string | undefined): string {
  return isChineseConsistencyLocale(locale) ? PAIRWISE_SYSTEM_PROMPT_ZH : PAIRWISE_SYSTEM_PROMPT;
}

function getCharacterConsistencySystemPrompt(locale: string | undefined): string {
  return isChineseConsistencyLocale(locale)
    ? CHARACTER_SYSTEM_PROMPT_ZH
    : CHARACTER_SYSTEM_PROMPT;
}

function isChineseConsistencyLocale(locale: string | undefined): boolean {
  return locale?.trim().toLowerCase().startsWith('zh') === true;
}

function formatPairwiseConsistencyUserText(
  fromInput: ConsistencyInput,
  toInput: ConsistencyInput,
  globalStyle: string | undefined,
  locale: string | undefined,
): string {
  if (isChineseConsistencyLocale(locale)) {
    return (
      (globalStyle ? `全局风格：“${globalStyle}”\n` : '') +
      `场景 A（index ${fromInput.sceneIndex}）：“${fromInput.prompt}”\n` +
      `场景 B（index ${toInput.sceneIndex}）：“${toInput.prompt}”\n\n` +
      '比较这两张相邻场景图像的视觉一致性。'
    );
  }

  return (
    (globalStyle ? `Global style: "${globalStyle}"\n` : '') +
    `Scene A (index ${fromInput.sceneIndex}): "${fromInput.prompt}"\n` +
    `Scene B (index ${toInput.sceneIndex}): "${toInput.prompt}"\n\n` +
    'Compare these two adjacent scene images for visual consistency.'
  );
}

function formatCharacterConsistencyUserText(
  charRef: CharacterRef,
  locale: string | undefined,
): string {
  if (isChineseConsistencyLocale(locale)) {
    return `角色：“${charRef.name}” — ${charRef.description}\n\n参考图像在前，当前场景图像在后。请评估一致性。`;
  }

  return `Character: "${charRef.name}" — ${charRef.description}\n\nReference image (first), current scene image (second). Evaluate consistency.`;
}

// =============================================================================
// Implementation
// =============================================================================

export class ConsistencyEvaluator {
  constructor(private readonly deps: ConsistencyEvaluatorDeps) {}

  /**
   * Evaluate cross-scene consistency for a set of media inputs
   */
  async evaluate(
    inputs: ConsistencyInput[],
    context: ConsistencyContext = {},
  ): Promise<ConsistencyReport> {
    // Edge cases: 0 or 1 scene → perfect consistency
    if (inputs.length <= 1) {
      return {
        overallConsistency: 100,
        styleDrift: [],
        characterConsistency: [],
        aestheticScore: 100,
        recommendations: [],
      };
    }

    // Sort by scene index for consistent ordering
    const sorted = [...inputs].sort((a, b) => a.sceneIndex - b.sceneIndex);

    // Step 1: Extract representative images for each scene
    const images = await this.extractRepresentativeImages(sorted);

    // Step 2: Build adjacent pairs
    const pairs: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({ from: i, to: i + 1 });
    }

    // Step 3: CLIP fast-screen (optional)
    const clipDrifts = new Map<string, number>();
    if (this.deps.clipScorer && context.globalStyle) {
      await this.clipFastScreen(sorted, images, context.globalStyle, clipDrifts);
    }

    // Step 4: LLM pairwise evaluation for pairs that need it
    const styleDrift: StyleDriftPair[] = [];
    for (const pair of pairs) {
      const key = `${pair.from}-${pair.to}`;
      const clipDrift = clipDrifts.get(key);

      // If CLIP says consistent, skip LLM
      if (clipDrift !== undefined && clipDrift < CLIP_DRIFT_THRESHOLD) {
        styleDrift.push({
          fromScene: sorted[pair.from]!.sceneIndex,
          toScene: sorted[pair.to]!.sceneIndex,
          driftScore: clipDrift,
          description: 'Consistent (CLIP fast-screen)',
        });
        continue;
      }

      const fromImage = images.get(pair.from);
      const toImage = images.get(pair.to);
      if (!fromImage || !toImage) {
        // Cannot evaluate without images
        styleDrift.push({
          fromScene: sorted[pair.from]!.sceneIndex,
          toScene: sorted[pair.to]!.sceneIndex,
          driftScore: 50,
          description: 'Unable to extract images for comparison',
        });
        continue;
      }

      const result = await this.llmPairwiseEval(
        fromImage,
        toImage,
        sorted[pair.from]!,
        sorted[pair.to]!,
        context.globalStyle,
      );
      styleDrift.push(result);
    }

    // Step 5: Character consistency (optional)
    const characterConsistency: CharacterAppearance[] = [];
    if (context.characters && context.characters.length > 0) {
      for (const charRef of context.characters) {
        const appearance = await this.evaluateCharacterConsistency(sorted, images, charRef);
        if (appearance) {
          characterConsistency.push(appearance);
        }
      }
    }

    // Step 6: Aggregate scores
    const driftScores = styleDrift.map((d) => d.driftScore);
    const meanDrift =
      driftScores.length > 0 ? driftScores.reduce((a, b) => a + b, 0) / driftScores.length : 0;
    const overallConsistency = Math.round(Math.max(0, Math.min(100, 100 - meanDrift)));

    const aestheticScore = 70; // Default — can be enhanced with per-scene scoring later

    // Step 7: Generate recommendations
    const recommendations: string[] = [];
    const highDriftPairs = styleDrift.filter((d) => d.driftScore > 40);
    if (highDriftPairs.length > 0) {
      recommendations.push(
        `${highDriftPairs.length} scene pair(s) show significant style drift. ` +
          'Consider regenerating with consistent style prompt or applying color correction.',
      );
    }
    for (const char of characterConsistency) {
      const inconsistent = char.appearances.filter((a) => a.score < 70);
      if (inconsistent.length > 0) {
        recommendations.push(
          `Character "${char.name}" shows inconsistency in ${inconsistent.length} scene(s). ` +
            'Consider using IP-Adapter reference for regeneration.',
        );
      }
    }

    return {
      overallConsistency,
      styleDrift,
      characterConsistency,
      aestheticScore,
      recommendations,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Extract a representative base64 image for each scene.
   * Images → read file as base64; Videos → extract middle frame.
   */
  private async extractRepresentativeImages(
    inputs: ConsistencyInput[],
  ): Promise<Map<number, string>> {
    const images = new Map<number, string>();

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      const ext = input.mediaPath.substring(input.mediaPath.lastIndexOf('.')).toLowerCase();

      if (VIDEO_EXTENSIONS.has(ext)) {
        if (!this.deps.frameExtractor) continue;
        try {
          const meta = await this.deps.frameExtractor.probe(input.mediaPath);
          const midTime = meta.duration / 2;
          const frame = await this.deps.frameExtractor.extractFrame(input.mediaPath, midTime);
          if (frame) images.set(i, frame);
        } catch {
          // Skip video scenes that fail extraction
        }
      } else {
        // Assume image — use path as identifier for LLM (base64 read at LLM call time)
        images.set(i, input.mediaPath);
      }
    }

    return images;
  }

  /**
   * CLIP fast-screen: compute drift between adjacent scenes via style text alignment
   */
  private async clipFastScreen(
    inputs: ConsistencyInput[],
    images: Map<number, string>,
    globalStyle: string,
    drifts: Map<string, number>,
  ): Promise<void> {
    const clipScorer = this.deps.clipScorer!;
    const scores = new Map<number, number>();

    // Compute CLIP score for each scene against globalStyle
    for (let i = 0; i < inputs.length; i++) {
      const imagePath = images.get(i);
      if (!imagePath) continue;
      try {
        const score = await clipScorer.score(imagePath, globalStyle);
        scores.set(i, score);
      } catch {
        // Skip on CLIP failure
      }
    }

    // Compute drift for adjacent pairs
    for (let i = 0; i < inputs.length - 1; i++) {
      const scoreA = scores.get(i);
      const scoreB = scores.get(i + 1);
      if (scoreA !== undefined && scoreB !== undefined) {
        // CLIP score range [-1, 1], diff normalized to 0-100
        const rawDiff = Math.abs(scoreA - scoreB);
        const drift = Math.round(rawDiff * 50); // max diff of 2 → 100
        drifts.set(`${i}-${i + 1}`, drift);
      }
    }
  }

  /**
   * Vision LLM pairwise evaluation for a scene pair
   */
  private async llmPairwiseEval(
    fromImage: string,
    toImage: string,
    fromInput: ConsistencyInput,
    toInput: ConsistencyInput,
    globalStyle?: string,
  ): Promise<StyleDriftPair> {
    const service = this.deps.createService();
    const userContent = [
      {
        type: 'text',
        text: formatPairwiseConsistencyUserText(
          fromInput,
          toInput,
          globalStyle,
          this.deps.locale,
        ),
      },
      { type: 'image', imageUrl: fromImage },
      { type: 'image', imageUrl: toImage },
    ];

    try {
      const response = await service.chat(
        [
          { role: 'system', content: getPairwiseConsistencySystemPrompt(this.deps.locale) },
          { role: 'user', content: userContent },
        ],
        withConsistencyChatModelRouting({ maxTokens: 512 }, this.deps.chatModel),
      );

      const text = typeof response.message.content === 'string' ? response.message.content : '';
      const parsed = this.parseJson(text);

      return {
        fromScene: fromInput.sceneIndex,
        toScene: toInput.sceneIndex,
        driftScore: this.coerceScore(parsed?.driftScore),
        description:
          typeof parsed?.description === 'string' ? parsed.description : 'LLM evaluation completed',
      };
    } catch (error) {
      if (isExplicitChatRoutingError(error)) {
        throw error;
      }
      return {
        fromScene: fromInput.sceneIndex,
        toScene: toInput.sceneIndex,
        driftScore: 50,
        description: 'LLM evaluation failed — defaulting to moderate drift',
      };
    }
  }

  /**
   * Evaluate character consistency across scenes
   */
  private async evaluateCharacterConsistency(
    inputs: ConsistencyInput[],
    images: Map<number, string>,
    charRef: CharacterRef,
  ): Promise<CharacterAppearance | null> {
    // Find first scene with an available image as reference
    const referenceImage = charRef.referenceImagePath ?? images.get(0);
    if (!referenceImage) return null;

    const appearances: CharacterAppearance['appearances'] = [];

    for (let i = 0; i < inputs.length; i++) {
      const sceneImage = images.get(i);
      if (!sceneImage) continue;

      // Skip reference scene comparison with itself
      if (sceneImage === referenceImage && i === 0) {
        appearances.push({
          sceneIndex: inputs[i]!.sceneIndex,
          score: 100,
          issues: [],
        });
        continue;
      }

      const result = await this.llmCharacterEval(referenceImage, sceneImage, charRef);
      appearances.push({
        sceneIndex: inputs[i]!.sceneIndex,
        ...result,
      });
    }

    return { name: charRef.name, appearances };
  }

  /**
   * LLM character consistency evaluation for a single scene vs reference
   */
  private async llmCharacterEval(
    referenceImage: string,
    sceneImage: string,
    charRef: CharacterRef,
  ): Promise<{ score: number; issues: string[] }> {
    const service = this.deps.createService();

    try {
      const response = await service.chat(
        [
          { role: 'system', content: getCharacterConsistencySystemPrompt(this.deps.locale) },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: formatCharacterConsistencyUserText(charRef, this.deps.locale),
              },
              { type: 'image', imageUrl: referenceImage },
              { type: 'image', imageUrl: sceneImage },
            ],
          },
        ],
        withConsistencyChatModelRouting({ maxTokens: 256 }, this.deps.chatModel),
      );

      const text = typeof response.message.content === 'string' ? response.message.content : '';
      const parsed = this.parseJson(text);

      return {
        score: this.coerceScore(parsed?.score),
        issues: Array.isArray(parsed?.issues)
          ? parsed.issues.filter((i: unknown) => typeof i === 'string')
          : [],
      };
    } catch (error) {
      if (isExplicitChatRoutingError(error)) {
        throw error;
      }
      return { score: 50, issues: ['Evaluation failed'] };
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private parseJson(text: string): Record<string, unknown> | null {
    try {
      // Strip markdown code fences if present
      const cleaned = text
        .replace(/```(?:json)?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private coerceScore(value: unknown): number {
    if (typeof value === 'number' && value >= 0 && value <= 100) {
      return Math.round(value);
    }
    return 50; // Default moderate score
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createConsistencyEvaluator(deps: ConsistencyEvaluatorDeps): ConsistencyEvaluator {
  return new ConsistencyEvaluator(deps);
}

function withConsistencyChatModelRouting(
  options: { maxTokens?: number },
  chatModel: ConsistencyChatModelRef | undefined,
): { maxTokens?: number; providerId: string; modelId: string } {
  if (!chatModel?.providerId || !chatModel.modelId) {
    throw new Error('Consistency LLM evaluation requires an explicit chat providerId and modelId.');
  }

  return {
    ...options,
    providerId: chatModel.providerId,
    modelId: chatModel.modelId,
  };
}
