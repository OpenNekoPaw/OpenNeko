import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const chatRoot = new URL('../', import.meta.url);

describe('VS Code Agent Host controller architecture', () => {
  it('keeps the replaced Extension-owned router path physically absent', () => {
    for (const removedPath of [
      'chatWebviewMessageRouter.ts',
      'router/conversationRoutes.ts',
      'router/projectionRoutes.ts',
      'router/settingsRoutes.ts',
      'router/skillContextRoutes.ts',
    ]) {
      expect(existsSync(new URL(removedPath, chatRoot))).toBe(false);
    }
  });

  it('composes the shared controller once and keeps responsibility routers out of Extension', () => {
    const productionSources = readTypeScriptSources(chatRoot);
    const sharedCompositionOwners = productionSources.filter(({ source }) =>
      /\bcreateAgentHostMessageController\b/u.test(source),
    );
    const directResponsibilityRouters = productionSources.filter(({ source }) =>
      /\btryHandleAgent(?:Conversation|Config|Skill|Content|Projection)ControllerRoute\b/u.test(
        source,
      ),
    );
    const oldRouterNames = productionSources.filter(({ source }) =>
      /\b(?:chatWebviewMessageRouter|ChatWebviewMessageRouter|handleChatWebviewMessage)\b/u.test(
        source,
      ),
    );

    expect(sharedCompositionOwners.map(({ path }) => path)).toEqual([
      'vscodeAgentHostMessageController.ts',
    ]);
    expect(directResponsibilityRouters).toEqual([]);
    expect(oldRouterNames).toEqual([]);
  });

  it('binds one controller instance per ChatViewProvider Webview connection', () => {
    const providerSource = readFileSync(new URL('../chatProvider.ts', import.meta.url), 'utf8');

    expect(providerSource).toContain(
      "import { createVSCodeAgentHostMessageController } from './vscodeAgentHostMessageController';",
    );
    expect(providerSource.match(/\bcreateVSCodeAgentHostMessageController\(/gu)).toHaveLength(1);
    expect(providerSource).toContain('await agentHostController.handle(message);');
  });
});

function readTypeScriptSources(
  root: URL,
): readonly { readonly path: string; readonly source: string }[] {
  const rootPath = root.pathname;
  return readDirectory(rootPath, rootPath);
}

function readDirectory(
  directory: string,
  root: string,
): readonly { readonly path: string; readonly source: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return readDirectory(path, root);
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    return [
      {
        path: relative(root, path),
        source: readFileSync(path, 'utf8'),
      },
    ];
  });
}
