/**
 * ConsistencyEvaluator unit tests
 *
 * Tests cross-scene consistency evaluation: CLIP fast-screen,
 * LLM pairwise evaluation, and character consistency tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConsistencyEvaluator,
  type ConsistencyEvaluatorDeps,
  type ConsistencyInput,
  type ConsistencyContext,
  type IClipScorer,
} from '../consistency-evaluator';

// =============================================================================
// Helpers
// =============================================================================

function createMockService(responseJson: unknown) {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { content: JSON.stringify(responseJson) },
    }),
  };
}

function createMockClipScorer(scores: Map<string, number>): IClipScorer {
  return {
    score: vi.fn().mockImplementation((imagePath: string, _text: string) => {
      return Promise.resolve(scores.get(imagePath) ?? 0.5);
    }),
  };
}

function createMockFrameExtractor(frameBase64: string | null = 'base64frame') {
  return {
    extractFrame: vi.fn().mockResolvedValue(frameBase64),
    probe: vi.fn().mockResolvedValue({ duration: 10, fps: 30, width: 1920, height: 1080 }),
  };
}

function createInputs(count: number): ConsistencyInput[] {
  return Array.from({ length: count }, (_, i) => ({
    sceneIndex: i,
    mediaPath: `/media/scene${i}.png`,
    prompt: `Scene ${i} prompt`,
  }));
}

const CHAT_MODEL = { providerId: 'deepseek-direct', modelId: 'deepseek-chat' } as const;

// =============================================================================
// Tests
// =============================================================================

describe('ConsistencyEvaluator', () => {
  let mockService: ReturnType<typeof createMockService>;
  let deps: ConsistencyEvaluatorDeps;

  beforeEach(() => {
    mockService = createMockService({
      driftScore: 20,
      description: 'Slight color shift',
      characterIssues: [],
    });
    deps = {
      createService: () => mockService,
      chatModel: CHAT_MODEL,
    };
  });

  it('should return valid ConsistencyReport for 3 scenes', async () => {
    const evaluator = new ConsistencyEvaluator(deps);
    const inputs = createInputs(3);

    const report = await evaluator.evaluate(inputs);

    expect(report).toHaveProperty('overallConsistency');
    expect(report).toHaveProperty('styleDrift');
    expect(report).toHaveProperty('characterConsistency');
    expect(report).toHaveProperty('aestheticScore');
    expect(report).toHaveProperty('recommendations');
    // 3 scenes → 2 adjacent pairs
    expect(report.styleDrift).toHaveLength(2);
    expect(report.overallConsistency).toBeGreaterThanOrEqual(0);
    expect(report.overallConsistency).toBeLessThanOrEqual(100);
  });

  it('should return perfect consistency for single scene', async () => {
    const evaluator = new ConsistencyEvaluator(deps);
    const inputs = createInputs(1);

    const report = await evaluator.evaluate(inputs);

    expect(report.overallConsistency).toBe(100);
    expect(report.styleDrift).toHaveLength(0);
    expect(report.characterConsistency).toHaveLength(0);
  });

  it('should return perfect consistency for empty inputs', async () => {
    const evaluator = new ConsistencyEvaluator(deps);

    const report = await evaluator.evaluate([]);

    expect(report.overallConsistency).toBe(100);
    expect(report.styleDrift).toHaveLength(0);
  });

  it('should skip LLM for pairs with low CLIP drift', async () => {
    // Both scenes have nearly identical CLIP scores → drift < threshold
    const clipScores = new Map([
      ['/media/scene0.png', 0.8],
      ['/media/scene1.png', 0.81],
    ]);
    const clipScorer = createMockClipScorer(clipScores);
    const evaluator = new ConsistencyEvaluator({
      ...deps,
      clipScorer,
    });

    const inputs = createInputs(2);
    const context: ConsistencyContext = { globalStyle: 'anime style' };

    const report = await evaluator.evaluate(inputs, context);

    // CLIP fast-screen should handle this — no LLM calls
    expect(mockService.chat).not.toHaveBeenCalled();
    expect(report.styleDrift).toHaveLength(1);
    expect(report.styleDrift[0]!.description).toContain('CLIP');
  });

  it('should call LLM when CLIP scorer is not provided', async () => {
    const evaluator = new ConsistencyEvaluator(deps);
    const inputs = createInputs(2);

    await evaluator.evaluate(inputs);

    // Without CLIP, all pairs go to LLM
    expect(mockService.chat).toHaveBeenCalled();
    expect(mockService.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        providerId: 'deepseek-direct',
        modelId: 'deepseek-chat',
      }),
    );
  });

  it('uses Chinese prompt wrappers for localized pairwise LLM evaluation', async () => {
    const evaluator = new ConsistencyEvaluator({
      ...deps,
      locale: 'zh-CN',
    });
    const inputs = createInputs(2);

    await evaluator.evaluate(inputs, { globalStyle: 'cinematic' });

    const messages = mockService.chat.mock.calls[0]![0] as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
    expect(messages[0]!.content).toContain('视觉一致性评估器');
    expect(messages[0]!.content).not.toContain('You are a visual consistency evaluator');
    const userText = (messages[1]!.content as Array<{ type: string; text?: string }>)[0]!.text!;
    expect(userText).toContain('全局风格');
    expect(userText).toContain('场景 A');
    expect(userText).toContain('比较这两张相邻场景图像');
    expect(userText).not.toContain('Global style');
  });

  it('should call LLM for pairs with high CLIP drift', async () => {
    // Significantly different CLIP scores → drift > threshold
    const clipScores = new Map([
      ['/media/scene0.png', 0.9],
      ['/media/scene1.png', 0.3],
    ]);
    const clipScorer = createMockClipScorer(clipScores);
    const evaluator = new ConsistencyEvaluator({
      ...deps,
      clipScorer,
    });

    const inputs = createInputs(2);
    const context: ConsistencyContext = { globalStyle: 'cinematic' };

    await evaluator.evaluate(inputs, context);

    // High drift → should proceed to LLM
    expect(mockService.chat).toHaveBeenCalled();
  });

  it('should compute overallConsistency correctly', async () => {
    // Mock LLM to return drift of 40
    mockService = createMockService({
      driftScore: 40,
      description: 'Noticeable style change',
      characterIssues: [],
    });
    deps = { createService: () => mockService, chatModel: CHAT_MODEL };

    const evaluator = new ConsistencyEvaluator(deps);
    const inputs = createInputs(2);

    const report = await evaluator.evaluate(inputs);

    // overallConsistency = 100 - mean(driftScores) = 100 - 40 = 60
    expect(report.overallConsistency).toBe(60);
  });

  it('should handle LLM parse failures gracefully', async () => {
    mockService = createMockService('invalid json response');
    // Override to return non-JSON
    mockService.chat.mockResolvedValue({
      message: { content: 'This is not JSON' },
    });
    deps = { createService: () => mockService, chatModel: CHAT_MODEL };

    const evaluator = new ConsistencyEvaluator(deps);
    const inputs = createInputs(2);

    const report = await evaluator.evaluate(inputs);

    // Should still return a valid report with default scores
    expect(report.overallConsistency).toBeGreaterThanOrEqual(0);
    expect(report.styleDrift).toHaveLength(1);
    expect(report.styleDrift[0]!.driftScore).toBe(50); // Default moderate score
  });

  it('should evaluate character consistency', async () => {
    // First call for pairwise eval, subsequent for character eval
    const callCount = { n: 0 };
    const service = {
      chat: vi.fn().mockImplementation(() => {
        callCount.n++;
        if (callCount.n <= 1) {
          // Pairwise eval
          return Promise.resolve({
            message: {
              content: JSON.stringify({
                driftScore: 10,
                description: 'Minimal drift',
                characterIssues: [],
              }),
            },
          });
        }
        // Character eval
        return Promise.resolve({
          message: {
            content: JSON.stringify({
              score: 75,
              issues: ['Hair color changed from red to brown'],
            }),
          },
        });
      }),
    };

    const evaluator = new ConsistencyEvaluator({
      createService: () => service,
      chatModel: CHAT_MODEL,
    });

    const inputs = createInputs(2);
    const context: ConsistencyContext = {
      characters: [{ name: 'Alice', description: 'Red-haired girl in blue dress' }],
    };

    const report = await evaluator.evaluate(inputs, context);

    expect(report.characterConsistency).toHaveLength(1);
    expect(report.characterConsistency[0]!.name).toBe('Alice');
    expect(report.characterConsistency[0]!.appearances.length).toBeGreaterThan(0);
  });

  it('uses Chinese prompt wrappers for localized character LLM evaluation', async () => {
    const service = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          message: {
            content: JSON.stringify({
              driftScore: 10,
              description: 'Minimal drift',
              characterIssues: [],
            }),
          },
        })
        .mockResolvedValueOnce({
          message: {
            content: JSON.stringify({
              score: 75,
              issues: ['Hair color changed from red to brown'],
            }),
          },
        }),
    };
    const evaluator = new ConsistencyEvaluator({
      createService: () => service,
      chatModel: CHAT_MODEL,
      locale: 'zh-CN',
    });

    await evaluator.evaluate(createInputs(2), {
      characters: [{ name: 'Alice', description: 'Red-haired girl in blue dress' }],
    });

    const messages = service.chat.mock.calls[1]![0] as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
    expect(messages[0]!.content).toContain('角色外观一致性');
    expect(messages[0]!.content).not.toContain('You are evaluating character appearance');
    const userText = (messages[1]!.content as Array<{ type: string; text?: string }>)[0]!.text!;
    expect(userText).toContain('角色：');
    expect(userText).toContain('参考图像');
    expect(userText).not.toContain('Reference image');
  });

  it('should extract video frames for video scenes', async () => {
    const frameExtractor = createMockFrameExtractor('base64videoframe');
    const evaluator = new ConsistencyEvaluator({
      ...deps,
      frameExtractor,
    });

    const inputs: ConsistencyInput[] = [
      { sceneIndex: 0, mediaPath: '/media/scene0.mp4', prompt: 'Video scene 0' },
      { sceneIndex: 1, mediaPath: '/media/scene1.mp4', prompt: 'Video scene 1' },
    ];

    await evaluator.evaluate(inputs);

    // Should probe and extract frames
    expect(frameExtractor.probe).toHaveBeenCalledTimes(2);
    expect(frameExtractor.extractFrame).toHaveBeenCalledTimes(2);
    // Middle frame at duration/2 = 5.0s
    expect(frameExtractor.extractFrame).toHaveBeenCalledWith('/media/scene0.mp4', 5);
  });

  it('should generate recommendations for high drift pairs', async () => {
    mockService = createMockService({
      driftScore: 60,
      description: 'Major style change',
      characterIssues: [],
    });
    deps = { createService: () => mockService, chatModel: CHAT_MODEL };

    const evaluator = new ConsistencyEvaluator(deps);
    const inputs = createInputs(2);

    const report = await evaluator.evaluate(inputs);

    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0]).toContain('style drift');
  });

  it('should fail visibly when LLM evaluation has no explicit chat model', async () => {
    const evaluator = new ConsistencyEvaluator({
      createService: () => mockService,
    });

    await expect(evaluator.evaluate(createInputs(2))).rejects.toThrow(
      'Consistency LLM evaluation requires an explicit chat providerId and modelId.',
    );
    expect(mockService.chat).not.toHaveBeenCalled();
  });
});
