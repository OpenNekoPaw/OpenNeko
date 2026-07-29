import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as core from '../core/index';
import * as model from '../model/index';
import * as project from '../project/index';

const packageRoot = resolve(import.meta.dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../..');

describe('@neko/quality architecture boundaries', () => {
  it('exposes core, model, and project behavior through distinct public entries', () => {
    expect(core.createQualityGateRuntime).toBeTypeOf('function');
    expect(model.createMultimodalPerceptionEvaluator).toBeTypeOf('function');
    expect(project.collectProjectQualityEvidence).toBeTypeOf('function');
    expect(Reflect.has(core, 'createMultimodalPerceptionEvaluator')).toBe(false);
  });

  it('depends only on shared contracts', () => {
    const forbiddenImports = [
      '@neko/agent',
      '@neko-agent/',
      '@neko/platform',
      '@neko/content',
      '@neko/entity',
      '@neko/cut',
      'vscode',
      'react',
    ];
    const violations = sourceFiles(resolve(packageRoot, 'src')).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbiddenImports
        .filter((specifier) => source.includes(`from '${specifier}`))
        .map((specifier) => `${file}: ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('poisons retired Agent-owned Quality runtime paths', () => {
    const retiredPaths = [
      'apps/neko-vscode/src/features/agent/capabilities/quality/quality-gate-runtime.ts',
      'apps/neko-vscode/src/features/agent/capabilities/quality/media-quality-runtime.ts',
      'apps/neko-vscode/src/features/agent/capabilities/quality/consistency-evaluator.ts',
      'apps/neko-vscode/src/features/agent/capabilities/quality/remediation-planner.ts',
      'apps/neko-vscode/src/features/agent/capabilities/quality/quality-review-validation.ts',
      'apps/neko-vscode/src/features/agent/capabilities/quality/index.ts',
      'apps/neko-vscode/src/features/agent/tools/projectQualityOrchestration.ts',
      'packages/neko-types/src/types/quality/qa-types.ts',
    ];

    expect(retiredPaths.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return absolute.endsWith('.ts') ? [absolute] : [];
  });
}
