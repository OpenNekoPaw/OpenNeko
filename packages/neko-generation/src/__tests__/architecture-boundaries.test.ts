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

  it('keeps the retired Platform package physically absent and unimportable', () => {
    const retiredPaths = [
      'packages/neko-platform/src/media/generation-job-contracts.ts',
      'packages/neko-platform/src/media/generation-job-coordinator.ts',
      'packages/neko-platform/src/media/generation-job-codec.ts',
      'packages/neko-platform/src/media/generation-job-migrations.ts',
      'packages/neko-platform/src/media/generation-job-store.ts',
    ];
    expect(retiredPaths.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);

    expect(existsSync(resolve(workspaceRoot, 'packages/neko-platform'))).toBe(false);
    const violations = ['apps', 'packages'].flatMap((root) =>
      sourceFiles(resolve(workspaceRoot, root))
        .filter((file) => !file.includes('/__tests__/') && !file.includes('.test.'))
        .flatMap((file) =>
          readFileSync(file, 'utf8').includes("from '@neko/platform")
            ? [relative(workspaceRoot, file)]
            : [],
        ),
    );
    expect(violations).toEqual([]);
  });

  it('keeps the retired cross-domain Activity authority physically absent', () => {
    const retiredPaths = [
      'apps/neko-vscode/src/domain-activity-host.ts',
      'packages/neko-shared/src/domain-activity/contracts.ts',
      'packages/neko-shared/src/domain-activity/index.ts',
      'packages/neko-shared/src/domain-activity/projector.ts',
      'packages/neko-generation/src/job/activity.ts',
      'packages/neko-generation/src/job/activity-port.ts',
      'packages/neko-agent-contracts/src/domain-activity-protocol.ts',
      'packages/neko-agent/packages/extension/src/chat/activity/domainActivityAttachmentServer.ts',
      'packages/neko-agent/packages/extension/src/chat/router/domainActivityRoutes.ts',
      'packages/neko-agent-webview/src/components/DomainActivityView.tsx',
      'packages/neko-agent-webview/src/hooks/useDomainActivity.ts',
    ];
    expect(retiredPaths.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);

    const productionRoots = [
      'apps/neko-vscode/src',
      'packages/neko-shared/src/domain-activity',
      'packages/neko-generation/src',
      'packages/neko-agent-contracts/src',
      'packages/neko-agent/packages/extension/src',
      'packages/neko-agent-webview/src',
      'packages/neko-cut/packages/extension/src',
    ];
    const forbidden = [
      /@neko\/shared\/domain-activity/u,
      /\bDomainActivity(?:Source|Summary|Projector|Publisher|Tracker|Snapshot|Patch|Command)?\b/u,
      /['"]domainJob\.command['"]/u,
      /\b(?:attach|acknowledge|detach)DomainActivity\b/u,
      /\bdomainActivity(?:Routes|Attachment|Host|Projector)\b/iu,
    ];
    const violations = productionRoots.flatMap((root) =>
      sourceFiles(resolve(workspaceRoot, root))
        .filter(
          (file) =>
            !file.includes('/__tests__/') &&
            !file.endsWith('.test.ts') &&
            !file.endsWith('.test.tsx'),
        )
        .flatMap((file) => {
          const source = readFileSync(file, 'utf8');
          return forbidden
            .filter((pattern) => pattern.test(source))
            .map((pattern) => `${relative(workspaceRoot, file)} matches ${pattern}`);
        }),
    );
    expect(violations).toEqual([]);
  });

  it('keeps Desktop and domain entry points on the canonical GenerationJob path', () => {
    const retiredCanvasGenerationPaths = [
      'packages/neko-canvas-domain/src/canvas-generation-runtime.ts',
      'packages/neko-canvas/packages/extension/src/canvasCreativeAiExecutor.ts',
      'packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts',
      'packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts',
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
      'packages/neko-cut/packages/extension/src/extension.ts',
    ];
    expect(
      retiredCanvasGenerationPaths.filter((file) => existsSync(resolve(workspaceRoot, file))),
    ).toEqual([]);

    const sources = new Map(
      [
        'packages/neko-agent-runtime/src/tools/generation/media-agent-tools.ts',
        'packages/neko-canvas-node/src/canvas-generation-node-runtime.ts',
        'apps/neko-desktop/src/main/desktop-cut-runtime.ts',
        'packages/neko-cut-node/src/CutExportTaskRegistry.ts',
      ].map((file) => [file, readFileSync(resolve(workspaceRoot, file), 'utf8')]),
    );
    const allEntrySource = [...sources.values()].join('\n');
    const agentToolSource = sources.get(
      'packages/neko-agent-runtime/src/tools/generation/media-agent-tools.ts',
    );
    const canvasGenerationSource = sources.get(
      'packages/neko-canvas-node/src/canvas-generation-node-runtime.ts',
    );
    const cutSource = sources.get('apps/neko-desktop/src/main/desktop-cut-runtime.ts');
    const cutExportRegistrySource = sources.get(
      'packages/neko-cut-node/src/CutExportTaskRegistry.ts',
    );

    expect(agentToolSource).toContain('jobs.submitGeneration');
    expect(agentToolSource).toContain('jobs.observeGeneration');
    expect(agentToolSource).not.toMatch(/\bmedia\.generate(?:Image|Video|Audio)\s*\(/u);
    expect(
      existsSync(
        resolve(workspaceRoot, 'packages/neko-generation/src/media/media-turn-dispatcher.ts'),
      ),
    ).toBe(false);
    expect(canvasGenerationSource).toContain('new GenerationJobCoordinator');
    expect(canvasGenerationSource).toContain('createPersistentGenerationJobStore');
    expect(canvasGenerationSource).toContain('owner.jobs.regenerateGeneration');
    expect(canvasGenerationSource).not.toMatch(
      /\b(?:executeCanvasCreativeAi|CanvasMediaService)\b/u,
    );
    expect(canvasGenerationSource).not.toMatch(/\.generateImage\s*\(/u);
    expect(cutSource).toContain('new CutExportTaskRegistry');
    expect(cutSource).not.toMatch(/sendCutSkillIntentToAgent\(\s*['"]video['"]/u);
    expect(cutExportRegistrySource).toContain('this.coordinator.cancelExport(commandFor(current))');
    expect(cutExportRegistrySource).not.toMatch(/\b(?:active|latest)Job\b/iu);
    expect(allEntrySource).not.toContain('purposeMediaService');
    expect(allEntrySource).not.toContain('ICapabilityMediaService');
    expect(allEntrySource).not.toContain('allowCreateBackgroundConversation');
  });

  it('keeps migrated creator-visible contracts independent from Resource Cache types', () => {
    const migratedFiles = [
      'packages/neko-generation/src/contracts.ts',
      'packages/neko-generation/src/job/contracts.ts',
      'packages/neko-canvas-domain/src/types/canvas-workspace-board.ts',
      'packages/neko-canvas-domain/src/utils/canvasWorkspaceBoardProjection.ts',
      'packages/neko-agent-contracts/src/creative-ai-invocation.ts',
      'packages/neko-agent-runtime/src/runtime/turn/creator-visible-artifact-collector.ts',
    ];
    const forbiddenImports = [
      /from ['"][^'"]*resource-cache['"]/u,
      /from ['"]@neko\/shared\/resource-cache['"]/u,
    ];
    const violations = migratedFiles.flatMap((file) => {
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
