import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('@neko/host architecture boundaries', () => {
  it('keeps host contracts free of concrete host implementations and domain packages', () => {
    const files = listTypeScriptFiles(resolve(packageRoot, 'src')).filter(
      (file) => !relative(packageRoot, file).replace(/\\/g, '/').includes('/__tests__/'),
    );
    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]electron['"]/,
      /from ['"]node:/,
      /from ['"]fs['"]/,
      /from ['"]path['"]/,
      /from ['"]react['"]/,
      /from ['"]@neko\/workbench-core/,
      /from ['"]@neko\/ui/,
      /from ['"]@neko\/agent/,
      /from ['"]@neko-agent\//,
      /from ['"]@neko\/content/,
      /from ['"]@neko\/entity/,
      /from ['"]@neko\/search/,
      /from ['"]@neko\/neko-client/,
      /from ['"]@neko\/webview/,
      /from ['"]@neko\/preview-webview/,
      /from ['"]@neko-(canvas|cut|audio|sketch|model|preview)\//,
      /ipc(Main|Renderer)/,
      /contextBridge/,
      /BrowserWindow/,
      /Workbench(Contribution|Feature|Webview)/,
      /AgentHostRuntime/,
      /ReadDocument/,
      /ReadImage/,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}
