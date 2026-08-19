import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as generation from '../index';
import * as generationJob from '../job';

const packageRoot = resolve(import.meta.dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../..');

describe('@neko/generation architecture boundaries', () => {
  it('keeps the root renderer-safe while exposing Job implementations explicitly', () => {
    expect(generation).not.toHaveProperty('GenerationJobCoordinator');
    expect(generation).not.toHaveProperty('createPersistentGenerationJobStore');
    expect(generation.GENERATION_JOB_KIND).toBe('generation');
    expect(generationJob.GenerationJobCoordinator).toBeTypeOf('function');
    expect(generationJob.createPersistentGenerationJobStore).toBeTypeOf('function');
  });

  it('keeps the root contracts, domain, and Job entries host-neutral', () => {
    const forbidden = [
      /from ['"]@neko\/platform/,
      /from ['"]@neko\/agent(?:\/|['"])/,
      /from ['"]@neko-agent\//,
      /from ['"]vscode['"]/,
      /from ['"]react/,
      /config\.toml/,
      /credential/i,
    ];

    const roots = [
      resolve(packageRoot, 'src/contracts.ts'),
      resolve(packageRoot, 'src/execution.ts'),
      resolve(packageRoot, 'src/generation-params.ts'),
      resolve(packageRoot, 'src/index.ts'),
      resolve(packageRoot, 'src/job'),
    ];
    for (const file of roots.flatMap((root) => sourceFiles(root))) {
      if (file.includes('/__tests__/')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps Desktop and domain entry points on the canonical GenerationJob path', () => {
    const sources = new Map(
      [
        'packages/agent/runtime/src/acp/generation-host-adapter.ts',
        'packages/canvas/node/src/canvas-generation-node-runtime.ts',
        'packages/generation/src/media/node-generation-job-owner.ts',
        'apps/neko-desktop/src/main/desktop-cut-runtime.ts',
        'packages/cut/node/src/CutApplicationRuntime.ts',
        'packages/cut/node/src/CutExportTaskRegistry.ts',
      ].map((file) => [file, readFileSync(resolve(workspaceRoot, file), 'utf8')]),
    );
    const allEntrySource = [...sources.values()].join('\n');
    const agentToolSource = sources.get(
      'packages/agent/runtime/src/acp/generation-host-adapter.ts',
    );
    const canvasGenerationSource = sources.get(
      'packages/canvas/node/src/canvas-generation-node-runtime.ts',
    );
    const generationOwnerSource = sources.get(
      'packages/generation/src/media/node-generation-job-owner.ts',
    );
    const cutSource = sources.get('apps/neko-desktop/src/main/desktop-cut-runtime.ts');
    const cutApplicationSource = sources.get('packages/cut/node/src/CutApplicationRuntime.ts');
    const cutExportRegistrySource = sources.get('packages/cut/node/src/CutExportTaskRegistry.ts');

    expect(agentToolSource).toContain('jobs.submitGeneration');
    expect(agentToolSource).toContain('jobs.describeGeneration');
    expect(agentToolSource).toContain('decodeGenerationDshToolInput');
    expect(agentToolSource).not.toMatch(/\bmedia\.generate(?:Image|Video|Audio)\s*\(/u);
    expect(
      existsSync(resolve(workspaceRoot, 'packages/generation/src/media/media-turn-dispatcher.ts')),
    ).toBe(false);
    expect(canvasGenerationSource).toContain('getWorkspaceJobs');
    expect(canvasGenerationSource).not.toContain('ConfigManager');
    expect(canvasGenerationSource).not.toContain('createMediaPlatform');
    expect(canvasGenerationSource).not.toContain('createNodeGenerationJobOwner');
    expect(canvasGenerationSource).not.toContain('new GenerationJobCoordinator');
    expect(canvasGenerationSource).not.toContain('createPersistentGenerationJobStore');
    expect(canvasGenerationSource).toContain('jobs.submitGeneration');
    expect(canvasGenerationSource).not.toContain('jobs.regenerateGeneration');
    expect(canvasGenerationSource).not.toMatch(
      /\b(?:executeCanvasCreativeAi|CanvasMediaService)\b/u,
    );
    expect(canvasGenerationSource).not.toMatch(/\.generateImage\s*\(/u);
    expect(generationOwnerSource).toContain('new GenerationJobCoordinator');
    expect(generationOwnerSource).toContain('createPersistentGenerationJobStore');
    expect(generationOwnerSource).toContain('finalizeMediaGenerationOutputs');
    expect(cutSource).toContain('new CutApplicationRuntime');
    expect(cutSource).not.toContain('new CutExportTaskRegistry');
    expect(cutApplicationSource).toContain('new CutExportTaskRegistry');
    expect(cutSource).not.toMatch(/sendCutSkillIntentToAgent\(\s*['"]video['"]/u);
    expect(cutExportRegistrySource).toContain('this.coordinator.cancelExport(commandFor(current))');
    expect(cutExportRegistrySource).not.toMatch(/\b(?:active|latest)Job\b/iu);
    expect(allEntrySource).not.toContain('purposeMediaService');
    expect(allEntrySource).not.toContain('ICapabilityMediaService');
    expect(allEntrySource).not.toContain('allowCreateBackgroundConversation');
    expect(existsSync(resolve(workspaceRoot, 'packages/generation/src/direct-operation.ts'))).toBe(
      false,
    );
    expect(
      existsSync(resolve(workspaceRoot, 'packages/generation/src/job/direct-operation-port.ts')),
    ).toBe(false);
    expect(generation).not.toHaveProperty('parseDirectGenerationOperationInput');
    expect(generationJob).not.toHaveProperty('createDirectGenerationOperationPort');
  });

  it('keeps creator-visible contract owners independent from Resource Cache types', () => {
    const ownedContractFiles = [
      'packages/generation/src/contracts.ts',
      'packages/generation/src/job/contracts.ts',
      'packages/canvas/domain/src/types/canvas-workspace-board.ts',
      'packages/canvas/domain/src/utils/canvasWorkspaceBoardProjection.ts',
    ];
    const forbiddenImports = [
      /from ['"][^'"]*resource-cache['"]/u,
      /from ['"]@neko\/shared\/resource-cache['"]/u,
    ];
    const violations = ownedContractFiles.flatMap((file) => {
      const source = readFileSync(resolve(workspaceRoot, file), 'utf8');
      return forbiddenImports
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) {
    return root.endsWith('.ts') || root.endsWith('.tsx') ? [root] : [];
  }
  return readdirSync(root).flatMap((entry) => {
    if (['node_modules', 'dist', 'coverage', '.turbo'].includes(entry)) return [];
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return absolute.endsWith('.ts') || absolute.endsWith('.tsx') ? [absolute] : [];
  });
}
