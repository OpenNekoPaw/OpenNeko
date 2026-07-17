import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createProviderExpressionPromptFragments,
  createProviderRouter,
  createProviderCardRegistry,
  parseProviderCardMarkdown,
  registerProviderCardDirectory,
} from '../index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cardDir = join(__dirname, '..', 'cards');

function readCard(name: string): string {
  return readFileSync(join(cardDir, name), 'utf-8');
}

describe('Provider Expression Context', () => {
  it('parses ProviderCard markdown into expression profiles', () => {
    const card = parseProviderCardMarkdown(readCard('flux.card.md'), {
      sourceLayer: 'builtin',
      sourceRef: 'flux.card.md',
    });

    expect(card.providerId).toBe('flux');
    expect(card.displayName).toBe('Flux.1');
    expect(card.capabilities).toEqual(['image.generate']);
    expect(card.syntaxProfile.supportsNegativePrompt).toBe(false);
    expect(card.syntaxProfile.promptTokenLimit).toBe(512);
    expect(card.conceptCoverage.entries).toContainEqual(
      expect.objectContaining({ concept: 'cyberpunk', status: 'native' }),
    );
    expect(card.conceptCoverage.entries).toContainEqual(
      expect.objectContaining({
        concept: 'cluttercore',
        status: 'unknown',
        expansion: 'maximalist collection, wall of objects, vintage room',
      }),
    );
    expect(card.trainingProfile.styleAffinities.photorealistic).toBe(3);
    expect(card.trainingProfile.styleAffinities.anime).toBe(2);
  });

  it('parses optional modelId from ProviderCard frontmatter', () => {
    const card = parseProviderCardMarkdown(
      `---
providerId: openai
modelId: gpt-image-1
version: 1.0.0
displayName: GPT Image
capabilities: [image.generate]
---
# GPT Image
`,
      { sourceLayer: 'builtin' },
    );

    expect(card.providerId).toBe('openai');
    expect(card.modelId).toBe('gpt-image-1');
  });

  it('parses ProviderCard input modalities separately from generation capabilities', () => {
    const card = parseProviderCardMarkdown(
      `---
providerId: openai
modelId: gpt-vision
version: 1.0.0
displayName: GPT Vision
capabilities: [image.generate]
inputModalities: [text, image, audio:realtime-only]
---
# GPT Vision
`,
      { sourceLayer: 'builtin' },
    );

    expect(card.capabilities).toEqual(['image.generate']);
    expect(card.inputModalities).toEqual({
      text: true,
      image: true,
      audio: 'realtime-only',
    });
  });

  it('routes by style affinity with preference and fallback reasoning', () => {
    const registry = createProviderCardRegistry([
      parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' }),
      parseProviderCardMarkdown(readCard('sdxl.card.md'), { sourceLayer: 'builtin' }),
    ]);
    const router = createProviderRouter(registry);

    const animeSelection = router.route({
      capability: 'image.generate',
      styleFamily: 'anime',
    });
    expect(animeSelection.primary).toBe('sdxl');
    expect(animeSelection.fallbacks).toEqual([{ providerId: 'flux' }]);
    expect(animeSelection.reason).toContain('image.generate/anime');

    const preferredSelection = router.route({
      capability: 'image.generate',
      styleFamily: 'anime',
      userPreference: { preferredProvider: 'flux' },
    });
    expect(preferredSelection.primary).toBe('flux');
    expect(preferredSelection.reason).toContain('user preferred');
  });

  it('keeps provider/model cards distinct and routes explicit model targets', () => {
    const base = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const model = parseProviderCardMarkdown(
      `---
providerId: flux
modelId: flux-anime
version: 1.0.0
displayName: Flux Anime
capabilities: [image.generate]
---
# Flux Anime

## Part 3: Training Profile

### Style Family Affinity
- ★★★ anime

### Anti-Bias Strategies
- keep clean line art
`,
      { sourceLayer: 'builtin' },
    );
    const registry = createProviderCardRegistry([base, model]);
    const router = createProviderRouter(registry);

    expect(registry.list({ providerId: 'flux' })).toHaveLength(2);
    expect(registry.get('flux')?.modelId).toBeUndefined();
    expect(registry.get('flux', 'flux-anime')?.displayName).toBe('Flux Anime');

    const selection = router.route({
      capability: 'image.generate',
      styleFamily: 'anime',
      providerId: 'flux',
      modelId: 'flux-anime',
    });

    expect(selection.primary).toBe('flux');
    expect(selection.modelId).toBe('flux-anime');
    expect(selection.fallbacks).toEqual([]);
    expect(selection.reason).toContain('flux/flux-anime');
  });

  it('returns fallback targets with modelId when candidates include provider models', () => {
    const base = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const model = parseProviderCardMarkdown(
      `---
providerId: flux
modelId: flux-lite
version: 1.0.0
displayName: Flux Lite
capabilities: [image.generate]
---
# Flux Lite

## Part 3: Training Profile

### Style Family Affinity
- ★★☆ photorealistic

### Anti-Bias Strategies
- prefer fast drafts
`,
      { sourceLayer: 'builtin' },
    );
    const registry = createProviderCardRegistry([base, model]);
    const router = createProviderRouter(registry);

    const selection = router.route({
      capability: 'image.generate',
      styleFamily: 'photorealistic',
      projectHints: {
        preferredTargets: [{ providerId: 'flux', modelId: 'flux-lite' }],
      },
    });

    expect(selection.primary).toBe('flux');
    expect(selection.modelId).toBe('flux-lite');
    expect(selection.fallbacks).toEqual([{ providerId: 'flux' }]);
    expect(selection.reason).toContain('project target preferred');
  });

  it('parses built-in provider card seeds for common media providers', () => {
    const cards = [
      'flux.card.md',
      'sdxl.card.md',
      'midjourney.card.md',
      'dalle.card.md',
      'runway.card.md',
      'sora.card.md',
    ].map((name) => parseProviderCardMarkdown(readCard(name), { sourceLayer: 'builtin' }));

    expect(cards.map((card) => card.providerId).sort()).toEqual([
      'dalle',
      'flux',
      'midjourney',
      'runway',
      'sdxl',
      'sora',
    ]);
    expect(cards.filter((card) => card.capabilities.includes('image.generate'))).toHaveLength(4);
    expect(cards.filter((card) => card.capabilities.includes('video.generate'))).toHaveLength(2);
    for (const card of cards) {
      expect(card.trainingProfile.antiBiasStrategies.length).toBeGreaterThan(0);
      expect(Object.keys(card.trainingProfile.styleAffinities).length).toBeGreaterThan(0);
    }
  });

  it('rejects provider cards with path-like provider ids at registry boundary', () => {
    const card = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const registry = createProviderCardRegistry();

    expect(() =>
      registry.register({
        ...card,
        providerId: '../../../etc/passwd',
      }),
    ).toThrow(/Invalid providerId/);
  });

  it('merges project card overrides over builtin cards', () => {
    const builtin = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const project = parseProviderCardMarkdown(
      `---
providerId: flux
version: 1.0.1
displayName: Flux Project Override
capabilities: [image.generate]
---
# Flux Project Override

## Part 3: Training Profile

### Style Family Affinity
- ★★★ anime

### Anti-Bias Strategies
- project prefers saturated anime palette
`,
      { sourceLayer: 'project' },
    );

    const registry = createProviderCardRegistry([builtin, project]);
    const card = registry.get('flux');

    expect(card?.displayName).toBe('Flux Project Override');
    expect(card?.sourceLayer).toBe('project');
    expect(card?.trainingProfile.styleAffinities.anime).toBe(3);
    expect(card?.trainingProfile.styleAffinities.photorealistic).toBe(3);
    expect(card?.trainingProfile.antiBiasStrategies).toContain(
      'project prefers saturated anime palette',
    );
  });

  it('renders provider cards as soft expression context for the agent', () => {
    const card = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });

    const fragments = createProviderExpressionPromptFragments({ cards: [card] });

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.id).toBe('provider:expression-context');
    expect(fragments[0]?.content).toContain('soft guidance');
    expect(fragments[0]?.content).toContain('not deterministic replacement rules');
    expect(fragments[0]?.content).toContain('Preserve the Plan/Task Markdown and user prompt');
    expect(fragments[0]?.content).toContain('Flux.1 (flux)');
    expect(fragments[0]?.content).toContain('Soft expression hint: cluttercore is unknown');
  });

  it('renders provider expression framing in Chinese for zh locale', () => {
    const card = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });

    const fragments = createProviderExpressionPromptFragments({ cards: [card], locale: 'zh' });

    expect(fragments).toHaveLength(1);
    const content = fragments[0]?.content ?? '';
    expect(content).toContain('## 供应方表达上下文');
    expect(content).toContain('软性指导');
    expect(content).toContain('不是确定性的替换规则');
    expect(content).toContain('- 能力: image.generate');
    expect(content).toContain('- 软性表达提示: cluttercore 是 unknown');
    expect(content).not.toContain('Use this selected provider card as soft guidance');
    expect(content).not.toContain('Capabilities:');
  });

  it('filters provider expression context by capability and style tendency in candidate mode', () => {
    const flux = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const sdxl = parseProviderCardMarkdown(readCard('sdxl.card.md'), { sourceLayer: 'builtin' });
    const runway = parseProviderCardMarkdown(readCard('runway.card.md'), {
      sourceLayer: 'builtin',
    });

    const fragments = createProviderExpressionPromptFragments({
      cards: [flux, sdxl, runway],
      capability: 'image.generate',
      preferredStyleFamily: 'anime',
      mode: 'candidates',
      maxCards: 1,
    });

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.content).toContain('SDXL');
    expect(fragments[0]?.content).not.toContain('Runway');
    expect(fragments[0]?.content).not.toContain('Flux.1');
  });

  it('limits broad candidate context per generation capability when capability is unknown', () => {
    const flux = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const sdxl = parseProviderCardMarkdown(readCard('sdxl.card.md'), { sourceLayer: 'builtin' });
    const dalle = parseProviderCardMarkdown(readCard('dalle.card.md'), { sourceLayer: 'builtin' });
    const runway = parseProviderCardMarkdown(readCard('runway.card.md'), {
      sourceLayer: 'builtin',
    });
    const sora = parseProviderCardMarkdown(readCard('sora.card.md'), { sourceLayer: 'builtin' });

    const fragments = createProviderExpressionPromptFragments({
      cards: [flux, sdxl, dalle, runway, sora],
      mode: 'candidates',
      maxCardsPerCapability: 1,
      maxCards: 4,
    });

    expect(fragments).toHaveLength(1);
    const content = fragments[0]?.content ?? '';
    const imageMatches = [
      content.includes('Flux.1'),
      content.includes('SDXL'),
      content.includes('DALL'),
    ].filter(Boolean).length;
    const videoMatches = [content.includes('Runway'), content.includes('Sora')].filter(
      Boolean,
    ).length;
    expect(imageMatches).toBe(1);
    expect(videoMatches).toBe(1);
  });

  it('renders stage-specific provider summaries for routing and generation', () => {
    const flux = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });

    const routing = createProviderExpressionPromptFragments({
      cards: [flux],
      mode: 'candidates',
      taskStage: 'routing',
    });
    const generation = createProviderExpressionPromptFragments({
      cards: [flux],
      mode: 'selected',
      taskStage: 'generation',
    });

    expect(routing[0]?.content).toContain('Style tendencies');
    expect(routing[0]?.content).toContain('Style prior');
    expect(routing[0]?.content).not.toContain('Soft expression hint');
    expect(generation[0]?.content).toContain('Preferred phrasing');
    expect(generation[0]?.content).toContain('Soft expression hint');
  });

  it('trims provider expression context to the configured token budget', () => {
    const flux = parseProviderCardMarkdown(readCard('flux.card.md'), { sourceLayer: 'builtin' });
    const sdxl = parseProviderCardMarkdown(readCard('sdxl.card.md'), { sourceLayer: 'builtin' });

    const fragments = createProviderExpressionPromptFragments({
      cards: [flux, sdxl],
      mode: 'candidates',
      maxCards: 2,
      maxContextTokens: 220,
      estimateTokens: (content) => content.length,
    });

    const content = fragments[0]?.content ?? '';
    expect(fragments).toHaveLength(1);
    expect(content.length).toBeLessThanOrEqual(220);
    expect(content).toContain('## Provider Expression Context');
    expect(content).toContain('omitted to stay within token budget');
    expect(content).not.toContain('Soft expression hint');
  });

  it('uses one selected provider card for an explicit provider/model target', () => {
    const providerDefault = parseProviderCardMarkdown(readCard('flux.card.md'), {
      sourceLayer: 'builtin',
    });
    const modelCard = parseProviderCardMarkdown(
      `---
providerId: flux
modelId: flux-pro-1.1
version: 1.1.0
displayName: Flux Pro 1.1
capabilities: [image.generate]
---
# Flux Pro 1.1

## Part 3: Training Profile

### Style Family Affinity
- ★★★ photorealistic

### Anti-Bias Strategies
- prefer detailed product lighting
`,
      { sourceLayer: 'builtin' },
    );

    const fragments = createProviderExpressionPromptFragments({
      cards: [providerDefault, modelCard],
      providerId: 'flux',
      modelId: 'flux-pro-1.1',
      capability: 'image.generate',
    });

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.content).toContain('Flux Pro 1.1 (flux/flux-pro-1.1)');
    expect(fragments[0]?.content).not.toContain('Flux.1 (flux)');
  });

  it('loads provider cards from project directories as project overrides', async () => {
    const root = '/workspace/.neko/providers';
    const registry = createProviderCardRegistry([
      parseProviderCardMarkdown(readCard('sdxl.card.md'), { sourceLayer: 'builtin' }),
    ]);
    const fs = {
      async readdir(path: string) {
        expect(path).toBe(root);
        return [
          {
            name: 'sdxl.card.md',
            isDirectory: () => false,
            isFile: () => true,
          },
        ];
      },
      async readFile(path: string) {
        expect(path).toBe(`${root}/sdxl.card.md`);
        return `---
providerId: sdxl
version: 1.1.0
displayName: SDXL Project Card
capabilities: [image.generate]
---
# SDXL Project Card

## Part 3: Training Profile

### Style Family Affinity
- ★★★ pixel-art

### Anti-Bias Strategies
- project pixel art override
`;
      },
    };

    const cards = await registerProviderCardDirectory({
      registry,
      root,
      sourceLayer: 'project',
      fs,
      sourceRefPrefix: '.neko/providers',
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.sourceRef).toBe('.neko/providers/sdxl.card.md');
    expect(registry.get('sdxl')?.displayName).toBe('SDXL Project Card');
    expect(registry.get('sdxl')?.trainingProfile.styleAffinities['pixel-art']).toBe(3);
  });
});
