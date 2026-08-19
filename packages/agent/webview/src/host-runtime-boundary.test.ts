import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(packageRoot, 'src');
const forbiddenHostNeutralPatterns = [
  {
    pattern: /window\[['"]hostApi['"]\]/u,
    replacement: 'use the injected AgentHostRuntimeAdapter facade',
  },
  {
    pattern: /\bAgentHostMessages\b/u,
    replacement: 'use useAgentHostMessages from the exact Root provider',
  },
  {
    pattern: /NEKO_AGENT_HOST_MESSAGE_EVENT/u,
    replacement: 'subscribe through the exact Root adapter',
  },
] as const;

describe('Agent Webview host runtime boundary', () => {
  it('keeps concrete host transport usage behind the injected adapter facade', () => {
    const violations = listProductionSources(srcRoot).flatMap((filePath) => {
      const relativePath = relative(srcRoot, filePath);
      const source = readFileSync(filePath, 'utf8');
      return forbiddenHostNeutralPatterns
        .filter((forbidden) => forbidden.pattern.test(source))
        .map(
          (forbidden) => `${relativePath} matches ${forbidden.pattern}: ${forbidden.replacement}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('keeps the Desktop transport adapter behind the host-neutral facade', () => {
    const messagesSource = readFileSync(join(srcRoot, 'messages/index.ts'), 'utf8');

    expect(messagesSource).toContain('createAgentHostMessages');
    expect(messagesSource).toContain('permanently bound to one Root-owned runtime adapter');
    expect(messagesSource).not.toContain('currentAgentHostRuntimeAdapter');
  });
});

function listProductionSources(dirPath: string): readonly string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') {
        continue;
      }
      result.push(...listProductionSources(entryPath));
      continue;
    }
    if (!isProductionSource(entryPath)) {
      continue;
    }
    result.push(entryPath);
  }
  return result;
}

function isProductionSource(filePath: string): boolean {
  const extension = extname(filePath);
  return (
    (extension === '.ts' || extension === '.tsx') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.test.tsx')
  );
}
