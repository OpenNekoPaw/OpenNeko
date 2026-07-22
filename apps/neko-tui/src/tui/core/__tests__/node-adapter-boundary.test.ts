import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const srcRoot = join(packageRoot, 'src', 'tui');

describe('TUI Node adapter boundary', () => {
  it('does not depend on Agent Webview host runtime transport', () => {
    const forbiddenPatterns = [
      {
        pattern: /@neko-agent\/webview/u,
        replacement: 'TUI must call Platform/Agent runtime services directly.',
      },
      {
        pattern: /AgentHostRuntime|AgentHostMessages|VSCodeMessages/u,
        replacement: 'TUI must not use Agent Webview message transport.',
      },
      {
        pattern: /NEKO_AGENT_HOST_MESSAGE_EVENT|host-message-event/u,
        replacement: 'TUI has no Webview host message event channel.',
      },
      {
        pattern: /window\.vscodeApi|acquireVsCodeApi/u,
        replacement: 'VSCode globals belong only to graphical Webview transport adapters.',
      },
    ] as const;

    const violations = listProductionSources(srcRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return forbiddenPatterns
        .filter((forbidden) => forbidden.pattern.test(source))
        .map(
          (forbidden) =>
            `${relative(packageRoot, filePath)} uses ${forbidden.pattern}: ${forbidden.replacement}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('keeps config, tasks, skills, content access, and workspace state on Node/runtime services', () => {
    const platformBootstrap = readFileSync(join(srcRoot, 'core', 'platform-bootstrap.ts'), 'utf8');
    const applicationRuntime = readFileSync(
      join(srcRoot, 'runtime', 'tui-application-runtime.ts'),
      'utf8',
    );
    const defaultCapabilities = readFileSync(
      join(srcRoot, 'host', 'tui-default-capabilities.ts'),
      'utf8',
    );
    const nodeHostAdapter = readFileSync(join(srcRoot, 'host', 'node-host-adapter.ts'), 'utf8');

    expect(platformBootstrap).toContain('FileUserConfigManager');
    expect(platformBootstrap).toContain('taskRecoveryStorage');
    expect(platformBootstrap).not.toContain('tasks.json');
    expect(applicationRuntime).toContain('createAgentTuiApplicationRuntime');
    expect(applicationRuntime).toContain('createConversationStore');
    expect(applicationRuntime).toContain('createConfigStore');
    expect(defaultCapabilities).toContain('createNodeContentAccessRuntime');
    expect(defaultCapabilities).toContain('createNodeWorkspaceContentHostAdapter');
    expect(defaultCapabilities).not.toContain('createNodeAssetsCapabilityProvider');
    expect(defaultCapabilities).toContain('createNodeEntitySearchCapabilityProviders');
    expect(nodeHostAdapter).toContain('createNodeHostAdapter');
  });

  it('does not compose the retired Asset catalog capability', () => {
    const defaultCapabilities = readFileSync(
      join(srcRoot, 'host', 'tui-default-capabilities.ts'),
      'utf8',
    );

    expect(defaultCapabilities).not.toContain('node-assets-capability');
    expect(defaultCapabilities).not.toContain('neko-assets/agent-headless');
  });

  it('keeps executable build ownership in the application manifest', () => {
    const packageManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      readonly bin?: unknown;
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly scripts?: Readonly<Record<string, string>>;
    };

    expect(packageManifest.bin).toEqual({
      neko: './dist/main.js',
      nekoagent: './dist/main.js',
    });
    expect(packageManifest.dependencies?.['@neko/cli']).toBeUndefined();
    expect(packageManifest.scripts?.['build']).toBe('tsup');
    expect(packageManifest.scripts?.['build:exe']).toBeUndefined();
    expect(packageManifest.scripts?.['build:bundle']).toBe('tsup');
    expect(packageManifest.scripts?.['dev']).toBe('tsx src/main.ts');
  });

  it('bundles every source-exported Workspace Board dependency into the executable', () => {
    const buildConfig = readFileSync(join(packageRoot, 'tsup.config.ts'), 'utf8');

    expect(buildConfig).toMatch(/noExternal:\s*\[[\s\S]*'@neko-canvas\/domain'/u);
  });
});

function listProductionSources(dirPath: string): readonly string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      result.push(...listProductionSources(entryPath));
      continue;
    }
    if (!isProductionSource(entryPath)) continue;
    result.push(entryPath);
  }
  return result;
}

function isProductionSource(filePath: string): boolean {
  if (!['.ts', '.tsx'].includes(extname(filePath))) return false;
  return !filePath.endsWith('.test.ts') && !filePath.endsWith('.test.tsx');
}
