import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { buildAgentPromptCommandMessage } from '@neko/agent/runtime';
import {
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
} from '@neko/shared';
import { registerAgentCoreCommands } from '../agentCoreCommands';

vi.mock('@neko/agent/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/agent/runtime')>();
  return {
    ...actual,
    buildAgentPromptCommandMessage: vi.fn(actual.buildAgentPromptCommandMessage),
  };
});

describe('agentCoreCommands bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects VSCode input and delegates image command prompt construction to runtime', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };
    const services = { get: vi.fn() };

    registerAgentCoreCommands(context as never, chatViewProvider as never, services as never);
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('sunset mountains');

    const generateImageRegistration = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === 'neko.ai.generateImage');
    const callback = generateImageRegistration?.[1];
    expect(callback).toBeDefined();

    await callback?.();

    expect(buildAgentPromptCommandMessage).toHaveBeenCalledWith({
      kind: 'generate-image',
      prompt: 'sunset mountains',
    });
    expect(chatViewProvider.sendMessageToAssistant).toHaveBeenCalledWith(
      'Generate an image: sunset mountains',
      true,
    );
  });

  it('forwards package-owned context without interpreting domain execution policy', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };

    registerAgentCoreCommands(
      context as never,
      chatViewProvider as never,
      { get: vi.fn() } as never,
    );

    const callback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === 'neko.agent.sendContext')?.[1];
    expect(callback).toBeDefined();

    const payload = {
      type: 'canvas-selection' as const,
      id: 'shot-1',
      label: 'Shot 1',
      summary: 'Canvas-owned context',
      data: { nodeId: 'shot-1' },
      intent: 'Review this shot using registered Canvas tools.',
    };
    await callback?.(payload);

    expect(chatViewProvider.sendContextPayload).toHaveBeenCalledWith(payload);
    expect(chatViewProvider.sendMessageToAssistant).not.toHaveBeenCalled();
  });

  it('registers the Character Dialogue command through the Agent-owned launch path', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn().mockResolvedValue({ sessionId: 'npc-session-1' }),
      startEmbodyCharacter: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };
    const services = { get: vi.fn() };

    registerAgentCoreCommands(context as never, chatViewProvider as never, services as never);

    const registration = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND);
    const callback = registration?.[1];
    expect(callback).toBeDefined();

    const request = {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      source: 'dashboard',
    };
    await callback?.(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(chatViewProvider.startCharacterDialogue).toHaveBeenCalledWith(request);
  });

  it('rejects invalid Character Dialogue launch command payloads', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn(),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };

    registerAgentCoreCommands(
      context as never,
      chatViewProvider as never,
      { get: vi.fn() } as never,
    );

    const callback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(([command]) => command === NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND)?.[1];
    await callback?.({ source: 'dashboard' });

    expect(chatViewProvider.startCharacterDialogue).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('无法启动角色对话：启动请求无效。');
  });

  it('registers Embody Character as an Agent-owned context switch', async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };
    const chatViewProvider = {
      sendMessageToAssistant: vi.fn(),
      sendContextPayload: vi.fn(),
      startCharacterDialogue: vi.fn(),
      startEmbodyCharacter: vi.fn().mockResolvedValue({
        ok: true,
        conversationId: 'conv-embody-xiaoju',
      }),
      dndBroker: { getPayload: vi.fn(), clearPayload: vi.fn() },
      setPluginCommandsGetter: vi.fn(),
      sendPluginSlashCommands: vi.fn(),
    };

    registerAgentCoreCommands(
      context as never,
      chatViewProvider as never,
      { get: vi.fn() } as never,
    );

    const callback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(
        ([registeredCommand]) => registeredCommand === NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
      )?.[1];
    expect(callback).toBeDefined();

    await callback?.({
      workflow: 'embody-character',
      entityRef: {
        entityId: 'char-xiaoju',
        entityKind: 'character',
        source: 'neko-entity',
        projectRoot: '/workspace',
      },
      dashboardRef: {
        source: 'neko-entity',
        sourceEntityId: 'entity:char-xiaoju',
        entityId: 'char-xiaoju',
        entityKind: 'character',
      },
      scopes: [{ kind: 'occurrence', source: 'neko-story', ref: 'cases/test.fountain:8' }],
      prompt: 'Check future knowledge leakage.',
      source: 'dashboard',
      projectRoot: '/workspace',
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(chatViewProvider.startCharacterDialogue).not.toHaveBeenCalled();
    expect(chatViewProvider.sendMessageToAssistant).not.toHaveBeenCalled();
    expect(chatViewProvider.startEmbodyCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: 'embody-character',
        entityRef: expect.objectContaining({ entityId: 'char-xiaoju' }),
      }),
    );
    expect(
      vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.some(
          ([registeredCommand]) => registeredCommand === 'neko.agent.validateCharacter',
        ),
    ).toBe(false);
    expect(
      vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.some(
          ([registeredCommand]) => registeredCommand === 'neko.agent.improveCharacter',
        ),
    ).toBe(false);
  });

  it('declares activation events for character role commands before the Agent panel opens', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8'),
    ) as { readonly activationEvents?: readonly string[] };

    expect(manifest.activationEvents).toContain(
      `onCommand:${NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND}`,
    );
    expect(manifest.activationEvents).toContain(`onCommand:${NEKO_AGENT_EMBODY_CHARACTER_COMMAND}`);
  });
});
