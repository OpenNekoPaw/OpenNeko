import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversationProjectionStore } from '@neko/agent/runtime';

import {
  registerTimelineProjectionAcceptanceCommands,
  TIMELINE_PROJECTION_ACCEPTANCE_CANCEL_COMMAND,
  TIMELINE_PROJECTION_ACCEPTANCE_CONTEXT_KEY,
  TIMELINE_PROJECTION_ACCEPTANCE_CONTINUE_COMMAND,
  TIMELINE_PROJECTION_ACCEPTANCE_START_COMMAND,
  TimelineProjectionAcceptanceController,
} from './timelineProjectionAcceptance';

const { executeCommand, registerCommand } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  registerCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  commands: { executeCommand, registerCommand },
}));

vi.mock('../base', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('TimelineProjectionAcceptanceController', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    executeCommand.mockResolvedValue(undefined);
    registerCommand.mockReset();
    registerCommand.mockImplementation((_command: string, callback: () => unknown) => ({
      callback,
      dispose: vi.fn(),
    }));
  });

  it('drives projector/store state through reattach, Tool result, and cancellation stages', () => {
    const projection = createConversationProjectionStore('conversation-a');
    let timestamp = 10;
    const controller = new TimelineProjectionAcceptanceController(
      { getOrCreateProjection: () => projection },
      { createRunId: () => 'fixed', now: () => timestamp++ },
    );

    expect(controller.start('conversation-a')).toMatchObject({
      phase: 'awaiting-reattach',
      projectionVersion: 5,
      toolItemRevision: 3,
      persistenceWrites: 0,
      canonicalPath: [
        'pi-product-event',
        'shared-pi-timeline-projector',
        'conversation-projection-store',
        'projection-attachment',
        'webview-tab-replica',
      ],
    });
    expect(controller.continueAfterReattach()).toMatchObject({
      phase: 'awaiting-cancel',
      primaryTerminalStatus: 'completed',
      toolStatus: 'succeeded',
    });
    const report = controller.cancel();
    expect(report).toMatchObject({
      phase: 'completed',
      primaryTerminalStatus: 'completed',
      cancellationTerminalStatus: 'cancelled',
      toolCallId: 'timeline-acceptance-tool-fixed',
      toolStatus: 'succeeded',
    });

    const snapshot = projection.snapshot();
    expect(snapshot.turns).toHaveLength(2);
    expect(snapshot.turns.map((turn) => turn.completion?.status)).toEqual([
      'completed',
      'cancelled',
    ]);
    expect(snapshot.turns[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool_call',
          status: 'succeeded',
          payload: expect.objectContaining({
            toolCall: expect.objectContaining({
              id: 'timeline-acceptance-tool-fixed',
              pendingConfirmation: false,
            }),
          }),
        }),
      ]),
    );
  });

  it('registers its functional controls only in an Extension Development Host', async () => {
    const controller = new TimelineProjectionAcceptanceController({
      getOrCreateProjection: () => createConversationProjectionStore('conversation-a'),
    });
    const chatViewProvider = {
      webview: {},
      getSelectedAgentConversationId: () => 'conversation-a',
    };
    const productionContext = { extensionMode: 1, subscriptions: [] };

    await registerTimelineProjectionAcceptanceCommands({
      context: productionContext as never,
      chatViewProvider: chatViewProvider as never,
      controller,
    });
    expect(registerCommand).not.toHaveBeenCalled();

    const developmentContext = { extensionMode: 2, subscriptions: [] };
    await registerTimelineProjectionAcceptanceCommands({
      context: developmentContext as never,
      chatViewProvider: chatViewProvider as never,
      controller,
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'setContext',
      TIMELINE_PROJECTION_ACCEPTANCE_CONTEXT_KEY,
      true,
    );
    expect(registerCommand.mock.calls.map(([command]) => command)).toEqual([
      TIMELINE_PROJECTION_ACCEPTANCE_START_COMMAND,
      TIMELINE_PROJECTION_ACCEPTANCE_CONTINUE_COMMAND,
      TIMELINE_PROJECTION_ACCEPTANCE_CANCEL_COMMAND,
    ]);
    expect(developmentContext.subscriptions).toHaveLength(4);
  });
});
