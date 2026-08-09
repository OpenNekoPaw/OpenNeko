import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('neko-chara architecture boundaries', () => {
  it('keeps core and application independent from Host, UI, and Agent implementations', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/application')),
    ];
    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]react/,
      /from ['"]@neko-agent\/extension/,
      /from ['"]@neko\/agent(?:\/|['"])/,
      /from ['"]@neko\/platform/,
      /from ['"]@neko\/entity\/host-vscode/,
      /from ['"]@neko\/search\/host-vscode/,
      /from ['"]@neko\/content\/(?:node|document\/node)['"]/,
      /from ['"][^'"]*webview[^'"]*['"]/i,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps removed host adapters absent from package exports', () => {
    expect(existsSync(resolve(packageRoot, 'src/host-vscode'))).toBe(false);

    for (const file of ['package.json', 'src/index.ts']) {
      const source = readFileSync(resolve(packageRoot, file), 'utf8');
      expect(source, `${file} must not expose a removed host adapter`).not.toMatch(
        /host-vscode|from ['"]vscode['"]|@neko-agent\/extension/,
      );
    }
  });

  it('keeps Character and Room contracts canonical and free of future control paths', () => {
    const contractFiles = listTypeScriptFiles(resolve(packageRoot, 'src/contracts'));
    const productionSources = contractFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(productionSources).not.toMatch(/schemaVersion|contractVersion|formatVersion/u);
    expect(productionSources).not.toMatch(/browser-use|computer-use|play-use|external-game|VLA/u);
    expect(productionSources).not.toMatch(/fallbackHandler|defaultHandler|tryNext/u);
    expect(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')).toContain(
      '"./contracts": "./src/contracts/index.ts"',
    );
  });

  it('keeps product interaction composition on the primary AgentSession port', () => {
    const source = readFileSync(
      resolve(packageRoot, 'src/application/character-interaction-service.ts'),
      'utf8',
    );

    expect(source).toContain('CharacterPrimaryAgentSessionPort');
    expect(source).toContain("purpose: 'character.primary'");
    expect(source).not.toMatch(/CharacterDialogueSession|EmbodyCharacterSession/u);
    expect(source).not.toMatch(
      /createCharacterDialoguePurposeResponder|createEmbodyCharacterPurposeResponder/u,
    );
    const applicationEntry = readFileSync(resolve(packageRoot, 'src/application/index.ts'), 'utf8');
    const coreEntry = readFileSync(resolve(packageRoot, 'src/core/index.ts'), 'utf8');
    const testingEntry = readFileSync(resolve(packageRoot, 'src/testing/index.ts'), 'utf8');
    expect(applicationEntry).not.toContain("'./character-dialogue-runtime'");
    expect(coreEntry).not.toMatch(/character-dialogue-session|embody-character-session/u);
    expect(testingEntry).toMatch(/character-dialogue-runtime/u);
    expect(testingEntry).toMatch(/character-dialogue-session|embody-character-session/u);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}
