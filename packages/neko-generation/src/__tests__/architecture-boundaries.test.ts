import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as generation from '../index';

const packageRoot = resolve(import.meta.dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../..');

describe('@neko/generation architecture boundaries', () => {
  it('exposes one host-neutral execution and Job contract', () => {
    expect(generation.GenerationJobCoordinator).toBeTypeOf('function');
    expect(generation.createPersistentGenerationJobStore).toBeTypeOf('function');
    expect(generation.GENERATION_JOB_KIND).toBe('generation');
  });

  it('does not depend on Agent, Platform, UI, or Host configuration readers', () => {
    const forbidden = [
      /from ['"]@neko\/platform/,
      /from ['"]@neko\/agent(?:\/|['"])/,
      /from ['"]@neko-agent\//,
      /from ['"]vscode['"]/,
      /from ['"]react/,
      /\bConfigManager\b/,
      /config\.toml/,
      /credential/i,
    ];

    for (const file of sourceFiles(resolve(packageRoot, 'src'))) {
      if (file.includes('/__tests__/')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('poisons the retired Platform Job implementation and Host compatibility imports', () => {
    const retiredPaths = [
      'packages/neko-agent/packages/platform/src/media/generation-job-contracts.ts',
      'packages/neko-agent/packages/platform/src/media/generation-job-coordinator.ts',
      'packages/neko-agent/packages/platform/src/media/generation-job-codec.ts',
      'packages/neko-agent/packages/platform/src/media/generation-job-migrations.ts',
      'packages/neko-agent/packages/platform/src/media/generation-job-store.ts',
    ];
    expect(retiredPaths.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);

    const platformEntries = [
      resolve(workspaceRoot, 'packages/neko-agent/packages/platform/src/index.ts'),
      resolve(workspaceRoot, 'packages/neko-agent/packages/platform/src/media/index.ts'),
    ];
    const forbiddenExports = [
      /\bGenerationJob\w*/,
      /\bGENERATION_JOB_MIGRATIONS\b/,
      /\bMediaGenerationExecutionOptions\b/,
      /\bMediaGenerationResult\b/,
    ];
    for (const entry of platformEntries) {
      const source = readFileSync(entry, 'utf8');
      for (const pattern of forbiddenExports) {
        expect(source, `${relative(workspaceRoot, entry)} re-exports ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }

    const hostRoots = [
      resolve(workspaceRoot, 'apps/neko-tui/src'),
      resolve(workspaceRoot, 'packages/neko-agent/packages/extension/src'),
    ];
    const violations = hostRoots.flatMap((root) =>
      sourceFiles(root).flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const imports = source.matchAll(
          /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"](@neko\/[^'"]+)['"];?/g,
        );
        return [...imports].some(
          ([, bindings, specifier]) =>
            specifier === '@neko/platform' && /\bGenerationJob\w*/.test(bindings ?? ''),
        )
          ? [relative(workspaceRoot, file)]
          : [];
      }),
    );
    expect(violations).toEqual([]);
  });

  it('keeps Agent and domain entry points on the canonical GenerationJob path', () => {
    const sources = new Map(
      [
        'packages/neko-agent/packages/platform/src/media/media-agent-tools.ts',
        'packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts',
        'packages/neko-canvas/packages/domain/src/canvas-generation-runtime.ts',
        'packages/neko-canvas/packages/extension/src/canvasCreativeAiExecutor.ts',
        'packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts',
        'packages/neko-cut/packages/extension/src/extension.ts',
      ].map((file) => [file, readFileSync(resolve(workspaceRoot, file), 'utf8')]),
    );
    const allEntrySource = [...sources.values()].join('\n');
    const agentToolSource = sources.get(
      'packages/neko-agent/packages/platform/src/media/media-agent-tools.ts',
    );
    const canvasDomainSource = sources.get(
      'packages/neko-canvas/packages/domain/src/canvas-generation-runtime.ts',
    );
    const cutSource = sources.get('packages/neko-cut/packages/extension/src/extension.ts');

    expect(agentToolSource).toContain('jobs.submitGeneration');
    expect(agentToolSource).toContain('jobs.observeGeneration');
    expect(agentToolSource).not.toMatch(/\bmedia\.generate(?:Image|Video|Audio)\s*\(/u);
    expect(
      sources.get('packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts'),
    ).not.toMatch(/\bsubmitMediaTurn\b|\bplatform\.media\b/u);
    expect(
      existsSync(
        resolve(
          workspaceRoot,
          'packages/neko-agent/packages/platform/src/media/media-turn-dispatcher.ts',
        ),
      ),
    ).toBe(false);
    expect(canvasDomainSource).not.toContain('CanvasMediaService');
    expect(canvasDomainSource).not.toMatch(/\.generateImage\s*\(/u);
    expect(
      sources.get('packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts'),
    ).not.toMatch(/\bensureProjectModel\b|neko\.project\.models\./u);
    expect(cutSource).not.toMatch(/sendCutSkillIntentToAgent\(\s*['"]video['"]/u);
    expect(allEntrySource).not.toContain('purposeMediaService');
    expect(allEntrySource).not.toContain('ICapabilityMediaService');
    expect(allEntrySource).not.toContain('allowCreateBackgroundConversation');
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return absolute.endsWith('.ts') || absolute.endsWith('.tsx') ? [absolute] : [];
  });
}
