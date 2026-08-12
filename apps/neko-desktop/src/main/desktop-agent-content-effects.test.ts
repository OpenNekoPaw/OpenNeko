import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentContentEffects,
  type AgentContentInteractionPort,
  type AgentHostRouteEffectContext,
} from '@neko/agent-runtime/runtime/host-controller';
import type { ILogger } from '@neko/shared/logger';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { searchWorkspaceLinkedMediaLibraryContentLocators } from '@neko/assets-node';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe('Desktop Agent content effects', () => {
  it('searches only the granted workspace and projects stable workspace locators', async () => {
    const fixture = await createFixture();
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'docs/guide.md', '# Guide');
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'src/guide.ts', 'export {};');
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'node_modules/guide.js', '');
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'private/guide.md', '');
    await writeFile(path.join(fixture.workspace.workspacePath, '.gitignore'), 'private/\n', 'utf8');

    await fixture.effects.searchProjectFiles(
      { filter: 'guide', conversationId: 'conversation-1' },
      fixture.context,
    );

    expect(fixture.context.post).toHaveBeenCalledWith({
      type: 'projectFiles',
      conversationId: 'conversation-1',
      filter: 'guide',
      files: [
        {
          locator: { kind: 'workspace-file', path: 'docs/guide.md' },
          name: 'guide.md',
          type: 'file',
          source: 'workspace',
          icon: 'MD',
          mediaType: 'text',
        },
        {
          locator: { kind: 'workspace-file', path: 'src/guide.ts' },
          name: 'guide.ts',
          type: 'file',
          source: 'workspace',
          icon: 'TS',
          mediaType: 'text',
        },
      ],
      mentionExtras: [],
    });
    expect(JSON.stringify(vi.mocked(fixture.context.post).mock.calls)).not.toContain(
      fixture.workspace.workspacePath,
    );
  });

  it('combines Entity-authority mentions with workspace files without treating names as paths', async () => {
    const fixture = await createFixture();
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'docs/小橘设定.md', '# 小橘');
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'assets/小橘.png', 'image');
    await writeWorkspaceFile(
      fixture.workspace.workspacePath,
      'neko/entities.json',
      JSON.stringify({
        projectId: fixture.workspace.workspaceId,
        entities: [
          {
            entityId: 'char_小橘',
            kind: 'character',
            names: { canonical: '小橘', aliases: ['橘猫'] },
            representations: [
              {
                bindingId: 'binding-xiaoju-portrait',
                target: { kind: 'workspace-file', path: 'assets/小橘.png' },
                role: 'portrait',
                source: 'user',
                acceptedAt: '2026-07-29T00:00:00.000Z',
              },
            ],
            lifecycle: { state: 'active' },
            createdAt: '2026-07-29T00:00:00.000Z',
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
          {
            entityId: 'char_invalid',
            kind: 'character',
            names: { canonical: '', aliases: [] },
            representations: [],
            lifecycle: { state: 'active' },
            createdAt: '2026-07-29T00:00:00.000Z',
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
        ],
      }),
    );

    await fixture.effects.searchProjectFiles(
      { filter: '小', conversationId: 'conversation-1' },
      fixture.context,
    );

    expect(fixture.context.post).toHaveBeenCalledWith({
      type: 'projectFiles',
      conversationId: 'conversation-1',
      filter: '小',
      files: [
        {
          locator: { kind: 'workspace-file', path: 'assets/小橘.png' },
          name: '小橘.png',
          type: 'file',
          source: 'workspace',
          mediaType: 'image',
        },
        {
          locator: { kind: 'workspace-file', path: 'docs/小橘设定.md' },
          name: '小橘设定.md',
          type: 'file',
          source: 'workspace',
          icon: 'MD',
          mediaType: 'text',
        },
      ],
      mentionExtras: [
        {
          type: 'entity',
          id: 'entity:character:char_小橘',
          label: '小橘',
          summary: 'Character: 小橘',
          searchText: '小橘 橘猫 character char_小橘',
          source: 'entity-graph',
          contentLocator: {
            kind: 'workspace-file',
            path: 'assets/小橘.png',
          },
          entityType: 'character',
          navigationData: {
            entityId: 'char_小橘',
            entityKind: 'character',
          },
        },
      ],
    });
  });

  it('projects linked Media Library files through the Session mention path', async () => {
    const fixture = await createFixture();
    const mediaRoot = await createTemporaryDirectory();
    await mkdir(path.join(fixture.workspace.workspacePath, 'neko', 'assets'), { recursive: true });
    await writeWorkspaceFile(mediaRoot, 'shots/hero.png', 'image');
    await symlink(
      mediaRoot,
      path.join(fixture.workspace.workspacePath, 'neko', 'assets', 'Reference'),
    );

    await fixture.effects.searchProjectFiles(
      { filter: 'hero', conversationId: 'conversation-1' },
      fixture.context,
    );

    expect(fixture.context.post).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            locator: { kind: 'workspace-file', path: 'neko/assets/Reference/shots/hero.png' },
            source: 'media-library',
            mediaType: 'image',
          }),
        ],
      }),
    );
  });

  it('rejects a mismatched sender-bound workspace grant before any effect runs', async () => {
    const fixture = await createFixture();
    const forgedContext = createContext('another-workspace');

    await expect(
      fixture.effects.openExternalUrl('https://example.com', forgedContext),
    ).rejects.toMatchObject({ code: 'desktop-agent-workspace-grant-mismatch' });
    expect(fixture.openExternal).not.toHaveBeenCalled();
    expect(fixture.interaction.openContent).not.toHaveBeenCalled();
  });

  it('uses the Host external port and preserves its protocol rejection', async () => {
    const fixture = await createFixture();

    await fixture.effects.openExternalUrl('https://example.com/guide', fixture.context);

    expect(fixture.openExternal).toHaveBeenCalledWith('https://example.com/guide');
    await expect(
      fixture.effects.openExternalUrl('file:///tmp/secret.txt', fixture.context),
    ).rejects.toThrow("Desktop refuses external URI protocol 'file:'");
    expect(fixture.openExternal).toHaveBeenCalledOnce();
  });

  it('resolves stable content identities inside the grant for open and reveal effects', async () => {
    const fixture = await createFixture();
    await writeWorkspaceFile(fixture.workspace.workspacePath, 'docs/guide.pdf', 'fixture');
    const contentLocator = {
      kind: 'workspace-file' as const,
      path: 'docs/guide.pdf',
    };
    const locator = { kind: 'page' as const, pageNumber: 3, pageIndex: 2 };

    await fixture.effects.openFile(
      { contentLocator, options: { preview: true, line: 4, column: 2 } },
      fixture.context,
    );
    await fixture.effects.revealDocumentLocator({ contentLocator, locator }, fixture.context);
    await fixture.effects.revealFile(contentLocator, fixture.context);
    await fixture.effects.revealContextSource(
      {
        type: 'revealContextSource',
        contextType: 'document-selection',
        contextId: 'selection-1',
        contentLocator,
      },
      fixture.context,
    );

    const absolutePath = await realpath(
      path.join(fixture.workspace.workspacePath, 'docs/guide.pdf'),
    );
    expect(fixture.interaction.openContent).toHaveBeenNthCalledWith(1, {
      identity: fixture.context.identity,
      workspaceId: fixture.workspace.workspaceId,
      contentLocator,
      absolutePath,
      options: { preview: true, line: 4, column: 2 },
    });
    expect(fixture.interaction.revealDocument).toHaveBeenCalledWith({
      identity: fixture.context.identity,
      workspaceId: fixture.workspace.workspaceId,
      contentLocator,
      absolutePath,
      locator,
    });
    expect(fixture.revealPath).toHaveBeenCalledWith(absolutePath);
    expect(fixture.interaction.openContent).toHaveBeenNthCalledWith(2, {
      identity: fixture.context.identity,
      workspaceId: fixture.workspace.workspaceId,
      contentLocator,
      absolutePath,
    });
  });

  it('rejects package resources and symlink escapes instead of falling back to a raw path', async () => {
    const fixture = await createFixture();
    const outside = await createTemporaryDirectory();
    await writeFile(path.join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(outside, path.join(fixture.workspace.workspacePath, 'linked-outside'));

    await expect(
      fixture.effects.openFile(
        {
          contentLocator: {
            kind: 'package-resource',
            packageId: 'plugin.example',
            revision: '1',
            resourcePath: 'secret.txt',
          },
        },
        fixture.context,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-content-kind-unsupported' });
    await expect(
      fixture.effects.openFile(
        {
          contentLocator: {
            kind: 'workspace-file',
            path: 'linked-outside/secret.txt',
          },
        },
        fixture.context,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-content-outside-workspace' });
    expect(fixture.interaction.openContent).not.toHaveBeenCalled();
  });

  it('writes SVG only to a Host-selected stable workspace locator', async () => {
    const fixture = await createFixture({
      selectWorkspaceWriteTarget: vi.fn(async () => ({
        kind: 'workspace-file' as const,
        path: 'exports/diagram.svg',
      })),
    });
    await mkdir(path.join(fixture.workspace.workspacePath, 'exports'));

    await fixture.effects.downloadSvg(
      { svg: '<svg><path /></svg>', filename: '../diagram.svg' },
      fixture.context,
    );

    await expect(
      fixture.host.files.readText(
        path.join(fixture.workspace.workspacePath, 'exports/diagram.svg'),
      ),
    ).resolves.toBe('<svg><path /></svg>');
    expect(fixture.interaction.selectWorkspaceWriteTarget).toHaveBeenCalledWith({
      identity: fixture.context.identity,
      workspaceId: fixture.workspace.workspaceId,
      suggestedLocator: { kind: 'workspace-file', path: 'diagram.svg' },
      mediaType: 'image/svg+xml',
    });
    expect(fixture.interaction.didWriteWorkspaceContent).toHaveBeenCalledWith({
      identity: fixture.context.identity,
      workspaceId: fixture.workspace.workspaceId,
      contentLocator: { kind: 'workspace-file', path: 'exports/diagram.svg' },
      byteLength: Buffer.byteLength('<svg><path /></svg>', 'utf8'),
    });
  });

  it('rejects a Host-selected SVG target whose parent symlink escapes the grant', async () => {
    const outside = await createTemporaryDirectory();
    const fixture = await createFixture({
      selectWorkspaceWriteTarget: vi.fn(async () => ({
        kind: 'workspace-file' as const,
        path: 'linked-outside/diagram.svg',
      })),
    });
    await symlink(outside, path.join(fixture.workspace.workspacePath, 'linked-outside'));

    await expect(
      fixture.effects.downloadSvg(
        { svg: '<svg><path /></svg>', filename: 'diagram.svg' },
        fixture.context,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-content-outside-workspace' });
    await expect(
      fixture.host.files.readText(path.join(outside, 'diagram.svg')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails visibly when context reveal has no stable locator', async () => {
    const fixture = await createFixture();

    await expect(
      fixture.effects.revealContextSource(
        {
          type: 'revealContextSource',
          contextType: 'entity',
          contextId: 'entity-1',
        },
        fixture.context,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-context-locator-required' });
  });
});

async function createFixture(interactionOverrides: Partial<AgentContentInteractionPort> = {}) {
  const workspacePath = await createTemporaryDirectory();
  const workspace: AssetWorkspaceResolution = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'variable', value: '${HOME}/fixture' },
  };
  const openExternal = vi.fn(async () => undefined);
  const revealPath = vi.fn();
  const host = createElectronNekoHostPorts({
    homedir: path.dirname(workspacePath),
    nekoHome: path.join(path.dirname(workspacePath), '.openneko'),
    workspaceRoot: workspacePath,
    logger: createLogger(),
    openExternal,
    revealPath,
  });
  const interaction: AgentContentInteractionPort = {
    openContent: vi.fn(async () => undefined),
    revealDocument: vi.fn(async () => undefined),
    selectWorkspaceWriteTarget: vi.fn(async () => undefined),
    didWriteWorkspaceContent: vi.fn(),
    ...interactionOverrides,
  };
  return {
    context: createContext(workspace.workspaceId),
    effects: createAgentContentEffects({
      workspace,
      host,
      interaction,
      searchLinkedMediaLibraryFiles: (input) =>
        searchWorkspaceLinkedMediaLibraryContentLocators({
          workspace,
          files: host.files,
          query: input.query,
          limit: input.limit,
        }),
    }),
    host,
    interaction,
    openExternal,
    revealPath,
    workspace,
  };
}

function createContext(workspaceId: string) {
  const post = vi.fn<AgentHostRouteEffectContext['post']>();
  return {
    identity: {
      hostKind: 'electron',
      applicationId: 'app-1',
      windowId: 'window-1',
      viewId: 'view-1',
      workspaceId,
      connectionId: 'connection-1',
    },
    post,
  } satisfies AgentHostRouteEffectContext;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openneko-desktop-content-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = path.join(workspacePath, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

function createLogger(): ILogger {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => createLogger(),
    setLevel: vi.fn(),
  };
}
