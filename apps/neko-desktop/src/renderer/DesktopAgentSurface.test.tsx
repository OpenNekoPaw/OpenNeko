// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshPermissionHostProjection } from '@neko/agent-contracts/dsh-permission-host';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type {
  DshComposerConfigurationProjection,
  DshSessionHostProjection,
} from '@neko/agent-contracts/dsh-session-host';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en' }),
}));

import { DesktopAgentSurface } from './DesktopAgentSurface';

const projection: DshSessionHostProjection = {
  conversationId: 'conversation-1',
  dshSessionId: 'dsh-session-1',
  currentTurn: 3,
  events: [
    { kind: 'message', role: 'user', text: 'Create a node', messageId: 'message-1' },
    {
      kind: 'tool',
      toolCallId: 'tool-1',
      turn: 3,
      status: 'in_progress',
      title: 'Canvas create node',
      rawInput: { operation: 'create-node', title: 'Opening' },
      rawOutput: { accepted: true },
    },
    { kind: 'message', role: 'assistant', text: 'Working on it', messageId: 'message-2' },
  ],
};

const permission: DshPermissionHostProjection = {
  conversationId: 'conversation-1',
  dshSessionId: 'dsh-session-1',
  turn: 3,
  toolCallId: 'tool-1',
  title: 'Allow Canvas write?',
  options: [
    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
  ],
};

const generationPermission: DshPermissionHostProjection = {
  conversationId: 'conversation-1',
  dshSessionId: 'dsh-session-1',
  turn: 3,
  toolCallId: 'tool-generation-1',
  title: 'Allow Generation submit?',
  options: [
    { optionId: 'allow-generation', name: 'Allow Generation once', kind: 'allow_once' },
    { optionId: 'reject-generation', name: 'Reject Generation', kind: 'reject_once' },
  ],
};

const composerConfiguration: DshComposerConfigurationProjection = {
  models: [
    {
      id: 'deepseek-official:deepseek-v4',
      label: 'DeepSeek V4',
      providerId: 'deepseek-official',
      modelId: 'deepseek-v4',
    },
    {
      id: 'openai:gpt-5',
      label: 'GPT-5',
      providerId: 'openai',
      modelId: 'gpt-5',
    },
  ],
  selectedModelOptionId: 'deepseek-official:deepseek-v4',
  executionMode: 'ask',
  modes: [
    { id: 'plan', available: false, diagnostic: 'Plan is unavailable.' },
    { id: 'ask', available: true },
    { id: 'auto', available: true },
  ],
  context: {
    kind: 'workspace',
    workspaceId: 'workspace-1',
    workspaceLabel: 'My Film',
    canvas: { kind: 'workspace-board', label: 'Board' },
  },
};

let sessionListener: ((event: { readonly conversationId: string }) => void) | undefined;
let permissionListener: ((event: { readonly conversationId: string }) => void) | undefined;
const dshSessions = {
  create: vi.fn(async () => projection),
  getSnapshot: vi.fn<() => Promise<DshSessionHostProjection>>(async () => projection),
  prompt: vi.fn(async () => ({ requestId: 'request-1', projection, stopReason: 'end_turn' })),
  cancel: vi.fn(async () => projection),
  getComposerConfiguration: vi.fn(async () => composerConfiguration),
  selectComposerModel: vi.fn(async () => ({
    ...composerConfiguration,
    selectedModelOptionId: 'openai:gpt-5',
  })),
  selectComposerMode: vi.fn(async () => ({
    ...composerConfiguration,
    executionMode: 'auto' as const,
  })),
  subscribe: vi.fn((listener: typeof sessionListener) => {
    sessionListener = listener;
    return vi.fn();
  }),
};
const dshPermissions = {
  list: vi.fn<() => Promise<readonly DshPermissionHostProjection[]>>(async () => [permission]),
  decide: vi.fn(async () => []),
  cancel: vi.fn(async () => []),
  subscribe: vi.fn((listener: typeof permissionListener) => {
    permissionListener = listener;
    return vi.fn();
  }),
};
let runtimeListener:
  | ((projection: {
      readonly status: 'running' | 'restarting' | 'unavailable';
      readonly diagnostic?: { readonly code: string; readonly message: string };
    }) => void)
  | undefined;
const dshRuntime = {
  getStatus: vi.fn<() => Promise<DshRuntimeHostProjection>>(async () => ({ status: 'running' })),
  restart: vi.fn<() => Promise<DshRuntimeHostProjection>>(async () => ({ status: 'running' })),
  subscribe: vi.fn((listener: typeof runtimeListener) => {
    runtimeListener = listener;
    return vi.fn();
  }),
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(window, { openNekoDesktop: { dshSessions, dshPermissions, dshRuntime } });
  vi.clearAllMocks();
  dshSessions.create.mockResolvedValue(projection);
  dshSessions.getSnapshot.mockResolvedValue(projection);
  dshSessions.prompt.mockResolvedValue({
    requestId: 'request-1',
    projection,
    stopReason: 'end_turn',
  });
  dshSessions.cancel.mockResolvedValue(projection);
  dshSessions.getComposerConfiguration.mockResolvedValue(composerConfiguration);
  dshSessions.selectComposerModel.mockResolvedValue({
    ...composerConfiguration,
    selectedModelOptionId: 'openai:gpt-5',
  });
  dshSessions.selectComposerMode.mockResolvedValue({
    ...composerConfiguration,
    executionMode: 'auto',
  });
  dshPermissions.list.mockResolvedValue([permission]);
  dshPermissions.decide.mockResolvedValue([]);
  dshPermissions.cancel.mockResolvedValue([]);
  dshRuntime.getStatus.mockResolvedValue({ status: 'running' });
  dshRuntime.restart.mockResolvedValue({ status: 'running' });
  sessionListener = undefined;
  permissionListener = undefined;
  runtimeListener = undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DesktopAgentSurface', () => {
  it('renders the bounded ACP projection and refreshes only its exact Conversation', async () => {
    const { container } = render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
      />,
    );

    expect(await screen.findByText('Create a node')).toBeTruthy();
    expect(screen.getByText('Canvas create node')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Allow Canvas write?')).toBeTruthy();
    expect(container.querySelector('[data-markdown-document="ready"]')).toBeTruthy();
    expect(container.querySelector('.agent-transcript-rail')).toBeTruthy();
    expect(container.querySelector('.agent-composer-shell')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Canvas create node/u }));
    expect(screen.getByText(/"operation": "create-node"/u)).toBeTruthy();
    expect(screen.getByText(/"accepted": true/u)).toBeTruthy();

    await act(async () => sessionListener?.({ conversationId: 'conversation-other' }));
    expect(dshSessions.getSnapshot).toHaveBeenCalledOnce();
    await act(async () => permissionListener?.({ conversationId: 'conversation-1' }));
    await waitFor(() => expect(dshSessions.getSnapshot).toHaveBeenCalledTimes(2));
  });

  it('does not let an older refresh replace the latest Host projection', async () => {
    const stale = deferred<DshSessionHostProjection>();
    dshSessions.getSnapshot
      .mockResolvedValueOnce(projection)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({
        ...projection,
        events: [
          {
            kind: 'message',
            role: 'assistant',
            text: 'Latest Host projection',
            messageId: 'message-latest',
          },
        ],
      });
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
      />,
    );
    expect(await screen.findByText('Create a node')).toBeTruthy();

    await act(async () => sessionListener?.({ conversationId: 'conversation-1' }));
    await waitFor(() => expect(dshSessions.getSnapshot).toHaveBeenCalledTimes(2));
    await act(async () => sessionListener?.({ conversationId: 'conversation-1' }));
    expect(await screen.findByText('Latest Host projection')).toBeTruthy();

    await act(async () =>
      stale.resolve({
        ...projection,
        events: [
          {
            kind: 'message',
            role: 'assistant',
            text: 'Stale Host projection',
            messageId: 'message-stale',
          },
        ],
      }),
    );
    expect(screen.queryByText('Stale Host projection')).toBeNull();
    expect(screen.getByText('Latest Host projection')).toBeTruthy();
  });

  it('submits, cancels, and decides only advertised ACP permission options', async () => {
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
      />,
    );
    await screen.findByText('Create a node');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() => expect(dshSessions.prompt).toHaveBeenCalledWith('conversation-1', 'hello'));

    fireEvent.click(screen.getByLabelText('Cancel current turn'));
    await waitFor(() => expect(dshSessions.cancel).toHaveBeenCalledWith('conversation-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    await waitFor(() =>
      expect(dshPermissions.decide).toHaveBeenCalledWith(
        {
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          turn: 3,
          toolCallId: 'tool-1',
        },
        'allow-once',
      ),
    );
  });

  it.each([
    [
      'Generation',
      generationPermission,
      'Allow Generation once',
      'tool-generation-1',
      'allow-generation',
    ],
    ['Canvas', permission, 'Allow once', 'tool-1', 'allow-once'],
  ] as const)(
    'routes %s approval through its exact ACP Tool identity',
    async (_tool, pendingPermission, optionName, toolCallId, optionId) => {
      dshPermissions.list.mockResolvedValueOnce([pendingPermission]);
      render(
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          agentSurfaceId="surface-1"
          conversationId="conversation-1"
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: optionName }));
      await waitFor(() =>
        expect(dshPermissions.decide).toHaveBeenCalledWith(
          {
            conversationId: 'conversation-1',
            dshSessionId: 'dsh-session-1',
            turn: 3,
            toolCallId,
          },
          optionId,
        ),
      );
    },
  );

  it('keeps the final composer visible without creating an implicit Conversation', async () => {
    render(
      <DesktopAgentSurface workbenchInstanceId="workbench-1" agentSurfaceId="surface-draft" />,
    );
    expect(screen.getByText('Hi, start creating with a conversation')).toBeTruthy();
    expect(dshSessions.getSnapshot).not.toHaveBeenCalled();
    expect(dshSessions.subscribe).not.toHaveBeenCalled();
    const composer = screen.getByLabelText('Message');
    await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
    expect(dshSessions.create).not.toHaveBeenCalled();
  });

  it('projects content-creation context and changes model and execution mode through Host ports', async () => {
    const { container } = render(
      <DesktopAgentSurface
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        workbenchInstanceId="workbench-1"
      />,
    );
    expect(await screen.findByText('My Film')).toBeTruthy();
    expect(screen.getByText('Board')).toBeTruthy();
    expect(container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Model' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'GPT-5' }));
    await waitFor(() =>
      expect(dshSessions.selectComposerModel).toHaveBeenCalledWith(
        'workbench-1',
        'surface-1',
        'openai:gpt-5',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Execution mode' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Auto' }));
    await waitFor(() =>
      expect(dshSessions.selectComposerMode).toHaveBeenCalledWith(
        'workbench-1',
        'surface-1',
        'auto',
      ),
    );
    expect(
      (screen.getByRole('button', { name: 'Add context' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('creates an exact Conversation and submits the first Draft message through it', async () => {
    const createdProjection: DshSessionHostProjection = {
      ...projection,
      conversationId: 'conversation-created',
      dshSessionId: 'dsh-session-created',
    };
    dshSessions.create.mockResolvedValueOnce(createdProjection);
    dshSessions.prompt.mockResolvedValueOnce({
      requestId: 'request-created',
      projection: createdProjection,
      stopReason: 'end_turn',
    });
    dshPermissions.list.mockResolvedValueOnce([]);
    render(
      <DesktopAgentSurface workbenchInstanceId="workbench-1" agentSurfaceId="surface-draft" />,
    );

    const composer = screen.getByLabelText('Message');
    await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(composer, { target: { value: '  first message  ' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() =>
      expect(dshSessions.create).toHaveBeenCalledWith('workbench-1', 'surface-draft'),
    );
    expect(dshSessions.prompt).toHaveBeenCalledWith('conversation-created', 'first message');
    expect(dshPermissions.list).toHaveBeenCalledWith('conversation-created');
    expect(await screen.findByText('Create a node')).toBeTruthy();
  });

  it('fails locally instead of rendering a permission from another DSH Session', async () => {
    dshPermissions.list.mockResolvedValueOnce([
      { ...permission, dshSessionId: 'dsh-session-other', title: 'Stale permission' },
    ]);
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
      />,
    );

    expect(
      await screen.findByText('DSH Agent projection owner identity does not match.'),
    ).toBeTruthy();
    expect(screen.queryByText('Stale permission')).toBeNull();
  });

  it('keeps the Conversation visible and exposes only explicit restart after a runtime crash', async () => {
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
      />,
    );
    expect(await screen.findByText('Create a node')).toBeTruthy();

    await act(async () =>
      runtimeListener?.({
        status: 'unavailable',
        diagnostic: {
          code: 'desktop-dsh-runtime-unavailable',
          message: 'DSH subprocess exited unexpectedly.',
        },
      }),
    );

    expect(screen.getByRole('alert').textContent).toContain('DSH subprocess exited unexpectedly.');
    expect(screen.getByText('Create a node')).toBeTruthy();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restart DSH' }));
    await waitFor(() => expect(dshRuntime.restart).toHaveBeenCalledOnce());
    await waitFor(() => expect(dshSessions.getSnapshot).toHaveBeenCalledTimes(2));
  });

  it('keeps restart failure visible and does not retry the Session path', async () => {
    dshRuntime.getStatus.mockResolvedValueOnce({
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-dsh-runtime-unavailable',
        message: 'DSH crashed.',
      },
    });
    dshRuntime.restart.mockResolvedValueOnce({
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-dsh-runtime-restart-failed',
        message: 'ACP handshake rejected.',
      },
    });
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
      />,
    );

    expect(await screen.findByText('DSH crashed.')).toBeTruthy();
    expect(screen.queryByText('Loading DSH session…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restart DSH' }));
    expect(await screen.findByText('ACP handshake rejected.')).toBeTruthy();
    expect(dshSessions.getSnapshot).not.toHaveBeenCalled();
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
