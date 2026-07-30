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
      'packages/neko-platform/src/media/generation-job-contracts.ts',
      'packages/neko-platform/src/media/generation-job-coordinator.ts',
      'packages/neko-platform/src/media/generation-job-codec.ts',
      'packages/neko-platform/src/media/generation-job-migrations.ts',
      'packages/neko-platform/src/media/generation-job-store.ts',
    ];
    expect(retiredPaths.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);

    const platformEntries = [
      resolve(workspaceRoot, 'packages/neko-platform/src/index.ts'),
      resolve(workspaceRoot, 'packages/neko-platform/src/media/index.ts'),
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

  it('keeps the retired cross-domain Activity authority physically absent', () => {
    const retiredPaths = [
      'apps/neko-vscode/src/domain-activity-host.ts',
      'packages/neko-types/src/domain-activity/contracts.ts',
      'packages/neko-types/src/domain-activity/index.ts',
      'packages/neko-types/src/domain-activity/projector.ts',
      'packages/neko-generation/src/job/activity.ts',
      'packages/neko-generation/src/job/activity-port.ts',
      'packages/neko-agent-types/src/domain-activity-protocol.ts',
      'packages/neko-agent/packages/extension/src/chat/activity/domainActivityAttachmentServer.ts',
      'packages/neko-agent/packages/extension/src/chat/router/domainActivityRoutes.ts',
      'packages/neko-agent-webview/src/components/DomainActivityView.tsx',
      'packages/neko-agent-webview/src/hooks/useDomainActivity.ts',
    ];
    expect(retiredPaths.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);

    const productionRoots = [
      'apps/neko-vscode/src',
      'packages/neko-types/src/domain-activity',
      'packages/neko-generation/src',
      'packages/neko-agent-types/src',
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

  it('keeps Agent and domain entry points on the canonical GenerationJob path', () => {
    const retiredCanvasGenerationPaths = [
      'packages/neko-canvas-domain/src/canvas-generation-runtime.ts',
      'packages/neko-canvas/packages/extension/src/canvasCreativeAiExecutor.ts',
    ];
    expect(
      retiredCanvasGenerationPaths.filter((file) => existsSync(resolve(workspaceRoot, file))),
    ).toEqual([]);

    const sources = new Map(
      [
        'packages/neko-platform/src/media/media-agent-tools.ts',
        'packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts',
        'packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts',
        'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
        'packages/neko-cut/packages/extension/src/extension.ts',
        'packages/neko-cut-node/src/CutExportTaskRegistry.ts',
      ].map((file) => [file, readFileSync(resolve(workspaceRoot, file), 'utf8')]),
    );
    const allEntrySource = [...sources.values()].join('\n');
    const agentToolSource = sources.get('packages/neko-platform/src/media/media-agent-tools.ts');
    const cutSource = sources.get('packages/neko-cut/packages/extension/src/extension.ts');
    const canvasEditorSource = sources.get(
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
    );
    const cutExportRegistrySource = sources.get(
      'packages/neko-cut-node/src/CutExportTaskRegistry.ts',
    );

    expect(agentToolSource).toContain('jobs.submitGeneration');
    expect(agentToolSource).toContain('jobs.observeGeneration');
    expect(agentToolSource).not.toMatch(/\bmedia\.generate(?:Image|Video|Audio)\s*\(/u);
    expect(
      sources.get('packages/neko-agent/packages/extension/src/services/mediaTurnBridge.ts'),
    ).not.toMatch(/\bsubmitMediaTurn\b|\bplatform\.media\b/u);
    expect(
      existsSync(
        resolve(workspaceRoot, 'packages/neko-platform/src/media/media-turn-dispatcher.ts'),
      ),
    ).toBe(false);
    expect(
      sources.get('packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts'),
    ).not.toMatch(/\bensureProjectModel\b|neko\.project\.models\./u);
    expect(canvasEditorSource).toContain("requestedAction: 'create-job'");
    expect(canvasEditorSource).toContain("'neko.agent.sendContext'");
    expect(canvasEditorSource).toContain("'neko.ai.sendMessage'");
    expect(canvasEditorSource).not.toMatch(
      /\b(?:jobs\.submitGeneration|executeCanvasCreativeAi|CanvasMediaService)\b/u,
    );
    expect(canvasEditorSource).not.toMatch(/\.generateImage\s*\(/u);
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
      'packages/neko-types/src/types/canvas-workspace-board.ts',
      'packages/neko-types/src/utils/canvasWorkspaceBoardProjection.ts',
      'packages/neko-types/src/types/creative-ai-invocation.ts',
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
  return readdirSync(root).flatMap((entry) => {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return absolute.endsWith('.ts') || absolute.endsWith('.tsx') ? [absolute] : [];
  });
}
