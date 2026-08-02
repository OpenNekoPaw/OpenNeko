import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');

const agentCriticalFiles = [
  'packages/neko-agent-webview/src/components/ChatView/index.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/InputArea.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/ModelSelector.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/ModeSelector.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/SessionModeSelector.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/ComposerConfigMenu.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/ModelTagList.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/EntryPromptMenu.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/MentionMenu.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/SlashCommandMenu.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/AmbientCanvasContextBar.tsx',
  'packages/neko-agent-webview/src/components/ChatView/InputArea/UsageIndicator.tsx',
];

describe('Agent UI isolation guardrail', () => {
  it('keeps Agent Header/Input and selector architecture out of the shared UI migration', () => {
    expect(
      agentCriticalFiles.every((relativePath) => existsSync(join(repoRoot, relativePath))),
    ).toBe(true);

    const uiSources = readSourceTree(join(repoRoot, 'packages/neko-ui/src'));
    const importsAgentWebview = uiSources.filter(({ source }) =>
      /(?:@neko-agent\/webview|packages\/neko-agent-webview\/src)/u.test(source),
    );

    expect(importsAgentWebview).toEqual([]);
  });
});

function readSourceTree(
  root: string,
): readonly { readonly path: string; readonly source: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : readSourceTree(entryPath);
    if (!/\.tsx?$/u.test(entry.name)) return [];
    return [{ path: entryPath, source: readFileSync(entryPath, 'utf8') }];
  });
}
