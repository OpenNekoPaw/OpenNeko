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

  it('keeps the Character launch contract on one strict mode shape', () => {
    const source = readFileSync(
      resolve(packageRoot, 'src/contracts/character-conversation-launch.ts'),
      'utf8',
    );

    expect(source).toContain("readonly mode: 'companion'");
    expect(source).toContain("readonly mode: 'narrative'");
    expect(source).toContain('NarrativeStorylineNodeSelection');
    expect(source).not.toMatch(
      /runtimeKind|externalCompositionRef|characterStorylineRunId|characterMemoryScopeId/u,
    );
  });

  it('keeps lore refs and Companion continuity inside Chara ownership', () => {
    const source = readFileSync(
      resolve(packageRoot, 'src/contracts/character-lore-storyline-memory.ts'),
      'utf8',
    );
    const continuitySource = readFileSync(
      resolve(packageRoot, 'src/contracts/character-companion-continuity.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]@neko\/world/u);
    expect(source).not.toMatch(
      /worldProjectId|worldVersionId|worldRunId|worldSaveId|branchId|activeCharacter|latestCharacter/u,
    );
    expect(source).toContain('CharacterVersionRef');
    expect(source).not.toContain('CharacterStorylineRunRef');
    expect(source).not.toMatch(/CharacterMemoryScope|characterMemoryScope/u);
    expect(continuitySource).toContain('CharacterCompanionContinuity');
    expect(continuitySource).toContain('sourceCharacterVersionId');
    expect(continuitySource).toContain('provenance');
  });

  it('keeps product interaction composition on the primary AgentSession port', () => {
    const source = readFileSync(
      resolve(packageRoot, 'src/application/character-interaction-service.ts'),
      'utf8',
    );

    expect(source).toContain('CharacterAgentConversationPort');
    expect(source).not.toContain('CharacterPrimaryAgentSessionPort');
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

  it('keeps the removed Companion Assistant and attachment owners unreachable', () => {
    const contractsEntry = readFileSync(resolve(packageRoot, 'src/contracts/index.ts'), 'utf8');
    const applicationEntry = readFileSync(resolve(packageRoot, 'src/application/index.ts'), 'utf8');
    const productionSources = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/contracts')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/application')),
    ]
      .filter((file) => !file.endsWith('.test.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(existsSync(resolve(packageRoot, 'src/contracts/character-companion-assistant.ts'))).toBe(
      false,
    );
    expect(
      existsSync(resolve(packageRoot, 'src/application/character-companion-assistant-service.ts')),
    ).toBe(false);
    expect(`${contractsEntry}\n${applicationEntry}\n${productionSources}`).not.toMatch(
      /CharacterCompanionAssistant|companionAssistantLane|CharacterExternalMaterial|externalMaterialRefs/u,
    );
  });

  it('keeps Storyline mutation exclusively in the Chara authoring service', () => {
    const runtimeSources = [
      'character-conversation-launch-service.ts',
      'character-dialogue-runtime.ts',
      'character-interaction-service.ts',
      'character-room-conversation-service.ts',
      'character-room-service.ts',
    ]
      .map((file) => readFileSync(resolve(packageRoot, 'src/application', file), 'utf8'))
      .join('\n');
    expect(runtimeSources).not.toMatch(
      /CharacterStorylineRun|StorylineObservation|acceptedTransition|progressRevision|updateStoryline|storeStorylineVersion|restoreAsDraft|deleteStoryline/u,
    );

    const packagesRoot = resolve(packageRoot, '..');
    const externalSources = ['agent', 'world', 'project', 'content', 'host']
      .flatMap((name) => listTypeScriptFiles(resolve(packagesRoot, name)))
      .filter((file) => !file.endsWith('.test.ts') && !file.includes('/node_modules/'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(externalSources).not.toMatch(
      /CharacterStorylineRun|characterStorylineRun|StorylineObservation|storylineTransition|storylineProgress|character-storyline-(?:create|update|publish|restore|delete)/u,
    );

    const contractsEntry = readFileSync(resolve(packageRoot, 'src/contracts/index.ts'), 'utf8');
    const applicationEntry = readFileSync(resolve(packageRoot, 'src/application/index.ts'), 'utf8');
    expect(`${contractsEntry}\n${applicationEntry}`).not.toMatch(
      /CharacterStorylineRun|StorylineObservation|StorylineTransition|StorylineProgress/u,
    );
    expect(applicationEntry).toContain("export * from './character-storyline-service';");
  });

  it('keeps CharacterVersion and Storyline graphs separate from the retired Pi authority', () => {
    const repositoryRoot = resolve(packageRoot, '../..');
    const versionGraph = readFileSync(
      resolve(packageRoot, 'src/application/character-version-graph-service.ts'),
      'utf8',
    );
    const storyline = readFileSync(
      resolve(packageRoot, 'src/application/character-storyline-service.ts'),
      'utf8',
    );
    const versionWorkspace = readFileSync(
      resolve(repositoryRoot, 'packages/chara-webview/src/character-version-workspace.tsx'),
      'utf8',
    );
    const retiredConversationAuthority = resolve(
      repositoryRoot,
      'packages/agent/runtime/src/pi/node-conversation-authority.ts',
    );

    expect(versionGraph).not.toMatch(/CharacterStoryline|ConversationBranch|ConversationTimeline/u);
    expect(storyline).not.toMatch(/CharacterVersionGraph|ConversationBranch|ConversationTimeline/u);
    expect(versionWorkspace).not.toMatch(
      /CharacterStoryline|ConversationBranch|ConversationTimeline/u,
    );
    expect(existsSync(retiredConversationAuthority)).toBe(false);
    expect(`${versionGraph}\n${storyline}`).not.toMatch(
      /Unified(?:Character)?(?:Graph|Timeline)|CrossGraphMutation/u,
    );
  });

  it('keeps Desktop Character composition on delegated projections and exact providers', () => {
    const repositoryRoot = resolve(packageRoot, '../..');
    const desktopShell = readFileSync(
      resolve(repositoryRoot, 'apps/neko-desktop/src/renderer/DesktopShell.tsx'),
      'utf8',
    );
    const desktopComposition = readFileSync(
      resolve(repositoryRoot, 'apps/neko-desktop/src/main/index.ts'),
      'utf8',
    );
    const agentConversationAdapter = readFileSync(
      resolve(repositoryRoot, 'apps/neko-desktop/src/main/character-agent-conversation-adapter.ts'),
      'utf8',
    );

    expect(desktopShell).toContain('DesktopCharacterPresentationSurfaceRegistry');
    expect(desktopShell).not.toMatch(/providerId\s*===\s*['"]chara\.representation/u);
    expect(agentConversationAdapter).not.toMatch(
      /AgentWorkspaceRuntime|startTurn|modelPolicy|companionMemory|candidate|canon/u,
    );
    expect(desktopComposition).not.toMatch(
      /CharacterPrimaryAgentSessionAdapter|executeRoomInitialInput|resolveExternalOwnerTurnRuntime/u,
    );
    expect(`${desktopShell}\n${agentConversationAdapter}`).not.toMatch(
      /forbiddenStoryFacts|authorOnlyNotes|projectCompanionContinuity|compatibilityDiagnostics/u,
    );
  });

  it('keeps the retired Agent Webview and Character capability provider absent', () => {
    const repositoryRoot = resolve(packageRoot, '../..');
    const productionFiles = listTypeScriptFiles(repositoryRoot).filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'),
    );
    const composerOwners = productionFiles
      .filter((file) => readFileSync(file, 'utf8').includes('<ComposerWorkspaceProvider'))
      .map((file) => relative(repositoryRoot, file));
    const characterProviderOwners = productionFiles
      .filter((file) =>
        readFileSync(file, 'utf8').includes('createCharacterAuthoringCapabilityProvider'),
      )
      .map((file) => relative(repositoryRoot, file));
    const agentWebviewSources = listTypeScriptFiles(
      resolve(repositoryRoot, 'packages/agent/webview/src'),
    )
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(composerOwners).toEqual([]);
    expect(characterProviderOwners).toEqual([]);
    expect(agentWebviewSources).not.toMatch(
      /ComposerWorkspaceProvider|@neko\/chara\/application|CharacterAuthoringCapabilityProvider/u,
    );
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}
