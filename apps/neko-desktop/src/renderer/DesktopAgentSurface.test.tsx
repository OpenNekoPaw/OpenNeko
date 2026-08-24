// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render as renderWithoutSnapshots,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshPermissionHostProjection } from '@neko/agent-contracts/dsh-permission-host';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type {
  DshComposerConfigurationProjection,
  DshSessionHostProjection,
  DshSessionHostResult,
} from '@neko/agent-contracts/dsh-session-host';

vi.mock('@neko/ui/i18n/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/ui/i18n/react')>();
  return {
    ...actual,
    useTranslation: () => ({ locale: 'en' }),
  };
});

import { DesktopAgentSurface } from './DesktopAgentSurface';
import { DshComposerPresentationSnapshotProvider } from '@neko/agent-webview/dsh-session/presentation-snapshot';

function render(view: ReactElement) {
  return renderWithoutSnapshots(
    <DshComposerPresentationSnapshotProvider>{view}</DshComposerPresentationSnapshotProvider>,
  );
}

const projection: DshSessionHostProjection = {
  conversationId: 'conversation-1',
  dshSessionId: 'dsh-session-1',
  title: 'Workspace planning',
  currentTurn: 3,
  inbox: { nextTurn: [], nextStep: [] },
  events: [
    {
      kind: 'message',
      role: 'user',
      content: [{ type: 'text', text: 'Create a node' }],
      messageId: 'message-1',
    },
    {
      kind: 'tool',
      toolCallId: 'tool-1',
      turn: 3,
      status: 'in_progress',
      title: 'Canvas create node',
      rawInput: { operation: 'create-node', title: 'Opening' },
      rawOutput: { accepted: true },
    },
    {
      kind: 'message',
      role: 'assistant',
      turn: 3,
      step: 0,
      text: 'Working on it',
      messageId: 'message-2',
      state: 'streaming',
    },
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

const workspaceBoardTarget = {
  kind: 'workspace-board' as const,
  workspaceId: 'workspace-1',
};

const composerConfiguration: DshComposerConfigurationProjection = {
  models: [
    {
      id: 'deepseek-official:deepseek-v4',
      label: 'DeepSeek V4',
      providerId: 'deepseek-official',
      modelId: 'deepseek-v4',
      providerLabel: 'DeepSeek',
      category: 'llm',
      capabilities: ['chat'],
    },
    {
      id: 'openai:gpt-5',
      label: 'GPT-5',
      providerId: 'openai',
      modelId: 'gpt-5',
      providerLabel: 'OpenAI',
      category: 'llm',
      capabilities: ['chat'],
    },
    {
      id: 'nekoapi-media:gpt-image-2',
      label: 'GPT Image 2',
      providerId: 'nekoapi-media',
      modelId: 'gpt-image-2',
      providerLabel: 'NekoAPI Media',
      category: 'image',
      capabilities: ['image.generate'],
    },
  ],
  selectedModelOptionId: 'deepseek-official:deepseek-v4',
  selectedMediaModelOptionIds: {},
  permissionPresetId: 'workspace-write',
  permissionPresets: [
    { id: 'read-only', label: 'read-only', selectable: true },
    { id: 'workspace-write', label: 'workspace-write', selectable: true },
    { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
  ],
  context: {
    kind: 'workspace',
    workspaceId: 'workspace-1',
    workspaceLabel: 'My Film',
    canvas: {
      workspaceId: 'workspace-1',
      defaultTarget: workspaceBoardTarget,
      options: [
        {
          target: workspaceBoardTarget,
          label: 'Board',
        },
      ],
      diagnostics: [],
    },
  },
};

const entryComposerConfiguration: DshComposerConfigurationProjection = {
  models: composerConfiguration.models,
  selectedModelOptionId: composerConfiguration.selectedModelOptionId,
  selectedMediaModelOptionIds: composerConfiguration.selectedMediaModelOptionIds,
  permissionPresetId: composerConfiguration.permissionPresetId,
  permissionPresets: composerConfiguration.permissionPresets,
};

let sessionListener: ((event: { readonly conversationId: string }) => void) | undefined;
let permissionListener: ((event: { readonly conversationId: string }) => void) | undefined;
let canvasWorkspaceIndexListener: ((event: { readonly workspaceId: string }) => void) | undefined;
const dshSessions = {
  create: vi.fn(async () => projection),
  getSnapshot: vi.fn<() => Promise<DshSessionHostProjection>>(async () => projection),
  submit: vi.fn<() => Promise<DshSessionHostResult>>(async () => ({
    requestId: 'request-1',
    projection,
    stopReason: 'end_turn',
  })),
  cancel: vi.fn(async () => projection),
  removeInboxMessage: vi.fn(async () => projection),
  openTerminalArtifact: vi.fn(async () => undefined),
  getImageAttachmentPreview: vi.fn(async () => ({
    url: 'openneko://resource/lease-1/image',
    mediaType: 'image/png' as const,
    byteLength: 4,
    width: 1,
    height: 1,
  })),
  releaseImageAttachmentPreviews: vi.fn(async () => undefined),
  getComposerConfiguration: vi.fn(async () => composerConfiguration),
  searchComposerMentions: vi.fn(async () => []),
  selectComposerModel: vi.fn(async () => ({
    ...composerConfiguration,
    selectedModelOptionId: 'openai:gpt-5',
  })),
  selectComposerPermissionPreset: vi.fn(async () => ({
    ...composerConfiguration,
    permissionPresetId: 'danger-full-access',
  })),
  selectComposerMediaModel: vi.fn(async () => composerConfiguration),
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
const canvas = {
  subscribeWorkspaceIndex: vi.fn((listener: typeof canvasWorkspaceIndexListener) => {
    canvasWorkspaceIndexListener = listener;
    return vi.fn();
  }),
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(window, { openNekoDesktop: { dshSessions, dshPermissions, dshRuntime, canvas } });
  vi.resetAllMocks();
  dshSessions.create.mockResolvedValue(projection);
  dshSessions.getSnapshot.mockResolvedValue(projection);
  dshSessions.submit.mockResolvedValue({
    requestId: 'request-1',
    projection,
    stopReason: 'end_turn',
  });
  dshSessions.cancel.mockResolvedValue(projection);
  dshSessions.removeInboxMessage.mockResolvedValue(projection);
  dshSessions.openTerminalArtifact.mockResolvedValue(undefined);
  dshSessions.releaseImageAttachmentPreviews.mockResolvedValue(undefined);
  dshSessions.getComposerConfiguration.mockResolvedValue(composerConfiguration);
  dshSessions.selectComposerModel.mockResolvedValue({
    ...composerConfiguration,
    selectedModelOptionId: 'openai:gpt-5',
  });
  dshSessions.selectComposerPermissionPreset.mockResolvedValue({
    ...composerConfiguration,
    permissionPresetId: 'danger-full-access',
  });
  dshSessions.selectComposerMediaModel.mockResolvedValue(composerConfiguration);
  dshPermissions.list.mockResolvedValue([permission]);
  dshPermissions.decide.mockResolvedValue([]);
  dshPermissions.cancel.mockResolvedValue([]);
  dshSessions.subscribe.mockImplementation((listener: typeof sessionListener) => {
    sessionListener = listener;
    return vi.fn();
  });
  dshPermissions.subscribe.mockImplementation((listener: typeof permissionListener) => {
    permissionListener = listener;
    return vi.fn();
  });
  dshRuntime.getStatus.mockResolvedValue({ status: 'running' });
  dshRuntime.restart.mockResolvedValue({ status: 'running' });
  dshRuntime.subscribe.mockImplementation((listener: typeof runtimeListener) => {
    runtimeListener = listener;
    return vi.fn();
  });
  canvas.subscribeWorkspaceIndex.mockImplementation(
    (listener: typeof canvasWorkspaceIndexListener) => {
      canvasWorkspaceIndexListener = listener;
      return vi.fn();
    },
  );
  sessionListener = undefined;
  permissionListener = undefined;
  runtimeListener = undefined;
  canvasWorkspaceIndexListener = undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DesktopAgentSurface', () => {
  it('releases exact Conversation image preview resources when the Surface unmounts', async () => {
    const view = render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
      />,
    );
    await screen.findByText('Create a node');

    view.unmount();

    await waitFor(() => {
      expect(dshSessions.releaseImageAttachmentPreviews).toHaveBeenCalledWith('conversation-1');
    });
  });

  it('renders the bounded ACP projection and refreshes only its exact Conversation', async () => {
    const { container } = render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
      />,
    );

    expect(await screen.findByText('Create a node')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Workspace planning' })).toBeTruthy();
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

  it('coalesces stream refreshes without letting an older projection replace the latest', async () => {
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
            turn: 3,
            step: 0,
            text: 'Latest Host projection',
            messageId: 'message-latest',
            state: 'final',
          },
        ],
      });
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
      />,
    );
    expect(await screen.findByText('Create a node')).toBeTruthy();

    await act(async () => sessionListener?.({ conversationId: 'conversation-1' }));
    await waitFor(() => expect(dshSessions.getSnapshot).toHaveBeenCalledTimes(2));
    await act(async () => sessionListener?.({ conversationId: 'conversation-1' }));

    await act(async () =>
      stale.resolve({
        ...projection,
        events: [
          {
            kind: 'message',
            role: 'assistant',
            turn: 3,
            step: 0,
            text: 'Stale Host projection',
            messageId: 'message-stale',
            state: 'final',
          },
        ],
      }),
    );
    expect(await screen.findByText('Latest Host projection')).toBeTruthy();
    expect(dshSessions.getSnapshot).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Stale Host projection')).toBeNull();
    expect(screen.getByText('Latest Host projection')).toBeTruthy();
  });

  it('submits, cancels, and decides only advertised ACP permission options', async () => {
    const idleProjection = { ...projection, currentTurn: undefined };
    dshSessions.getSnapshot.mockResolvedValueOnce(idleProjection);
    dshSessions.cancel.mockResolvedValueOnce(idleProjection);
    dshPermissions.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([permission])
      .mockResolvedValueOnce([]);
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
      />,
    );
    await screen.findByText('Create a node');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByLabelText('Send (Enter)'));
    await waitFor(() =>
      expect(dshSessions.submit).toHaveBeenCalledWith('conversation-1', {
        kind: 'message',
        text: 'hello',
        references: [],
        images: [],
        contextPayloads: [],
        canvasTurnTarget: workspaceBoardTarget,
      }),
    );

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

    fireEvent.click(screen.getByLabelText('Stop response (Esc)'));
    await waitFor(() => expect(dshSessions.cancel).toHaveBeenCalledWith('conversation-1'));
  });

  it('keeps the composer active and submits a second message to the DSH queue', async () => {
    const idleProjection = { ...projection, currentTurn: undefined };
    const pendingSubmit = deferred<{
      readonly requestId: string;
      readonly projection: DshSessionHostProjection;
      readonly stopReason: string;
    }>();
    dshSessions.getSnapshot.mockResolvedValueOnce(idleProjection).mockResolvedValue(projection);
    dshPermissions.list.mockResolvedValueOnce([]);
    dshSessions.submit
      .mockReturnValueOnce(pendingSubmit.promise)
      .mockResolvedValueOnce({ requestId: 'request-queued', projection });
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
      />,
    );
    await screen.findByText('Create a node');

    const composer = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'first request' } });
    fireEvent.click(screen.getByLabelText('Send (Enter)'));
    await waitFor(() => expect(dshSessions.submit).toHaveBeenCalledOnce());

    expect(composer.value).toBe('');
    expect(composer.disabled).toBe(false);
    expect(screen.getByLabelText('Stop response (Esc)')).toBeTruthy();
    fireEvent.change(composer, { target: { value: 'next request' } });
    expect(composer.value).toBe('next request');

    await act(async () => sessionListener?.({ conversationId: 'conversation-1' }));
    const queueButton = await screen.findByLabelText('Queue message (Enter)');
    fireEvent.click(queueButton);
    await waitFor(() => expect(dshSessions.submit).toHaveBeenCalledTimes(2));
    expect(dshSessions.submit).toHaveBeenLastCalledWith('conversation-1', {
      kind: 'message',
      text: 'next request',
      references: [],
      images: [],
      contextPayloads: [],
      canvasTurnTarget: workspaceBoardTarget,
    });

    await act(async () =>
      pendingSubmit.resolve({
        requestId: 'request-pending',
        projection: idleProjection,
        stopReason: 'end_turn',
      }),
    );
  });

  it('keeps the existing transcript and draft when a DSH submit fails visibly', async () => {
    dshSessions.getSnapshot.mockResolvedValueOnce({ ...projection, currentTurn: undefined });
    dshPermissions.list.mockResolvedValueOnce([]);
    dshSessions.submit.mockRejectedValueOnce(new Error('DSH submit rejected.'));
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
      />,
    );
    expect(await screen.findByText('Create a node')).toBeTruthy();

    const composer = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'retry this request' } });
    fireEvent.click(screen.getByLabelText('Send (Enter)'));

    expect(await screen.findByText('DSH submit rejected.')).toBeTruthy();
    expect(screen.getByText('Create a node')).toBeTruthy();
    expect(composer.value).toBe('retry this request');
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
          sceneId="scene-1"
          agentSurfaceId="surface-1"
          conversationId="conversation-1"
          surfaceKind="workspace"
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
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-draft"
        surfaceKind="entry"
      />,
    );
    expect(screen.getByText('Hi, start creating with a conversation')).toBeTruthy();
    expect(dshSessions.getSnapshot).not.toHaveBeenCalled();
    expect(dshSessions.subscribe).not.toHaveBeenCalled();
    const composer = screen.getByLabelText('Message');
    await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Execution mode' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Full access' }));
    await waitFor(() =>
      expect(dshSessions.selectComposerPermissionPreset).toHaveBeenCalledWith(
        'workbench-1',
        'surface-draft',
        'danger-full-access',
      ),
    );
    expect(dshSessions.create).not.toHaveBeenCalled();
  });

  it('refreshes Composer scope across a preserved Entry-to-Workspace Draft transition', async () => {
    dshSessions.getComposerConfiguration
      .mockResolvedValueOnce(entryComposerConfiguration)
      .mockResolvedValueOnce(composerConfiguration);
    const view = renderWithoutSnapshots(
      <DshComposerPresentationSnapshotProvider>
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          sceneId="scene-entry"
          agentSurfaceId="surface-draft"
          surfaceKind="entry"
        />
      </DshComposerPresentationSnapshotProvider>,
    );

    const composer = screen.getByLabelText('Message') as HTMLTextAreaElement;
    await waitFor(() => expect(composer.disabled).toBe(false));
    fireEvent.change(composer, { target: { value: 'Preserve this draft' } });

    view.rerender(
      <DshComposerPresentationSnapshotProvider>
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          sceneId="scene-workspace"
          agentSurfaceId="surface-draft"
          surfaceKind="workspace"
        />
      </DshComposerPresentationSnapshotProvider>,
    );

    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(
      'Preserve this draft',
    );
    expect(await screen.findByText('My Film')).toBeTruthy();
    expect(screen.getByText('Board')).toBeTruthy();
    expect(view.container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();
    expect(dshSessions.getComposerConfiguration).toHaveBeenNthCalledWith(
      2,
      'workbench-1',
      'surface-draft',
    );
    expect(dshSessions.create).not.toHaveBeenCalled();
    expect(dshSessions.submit).not.toHaveBeenCalled();
  });

  it('rejects a late Entry configuration after the preserved Draft enters a Workspace Scene', async () => {
    const staleEntryConfiguration = deferred<DshComposerConfigurationProjection>();
    dshSessions.getComposerConfiguration
      .mockReturnValueOnce(staleEntryConfiguration.promise)
      .mockResolvedValueOnce(composerConfiguration);
    const view = renderWithoutSnapshots(
      <DshComposerPresentationSnapshotProvider>
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          sceneId="scene-entry"
          agentSurfaceId="surface-draft"
          surfaceKind="entry"
        />
      </DshComposerPresentationSnapshotProvider>,
    );
    await waitFor(() => expect(dshSessions.getComposerConfiguration).toHaveBeenCalledOnce());

    view.rerender(
      <DshComposerPresentationSnapshotProvider>
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          sceneId="scene-workspace"
          agentSurfaceId="surface-draft"
          surfaceKind="workspace"
        />
      </DshComposerPresentationSnapshotProvider>,
    );

    expect(await screen.findByText('My Film')).toBeTruthy();
    await act(async () => staleEntryConfiguration.resolve(entryComposerConfiguration));
    expect(screen.getByText('My Film')).toBeTruthy();
    expect(view.container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();
    expect(dshSessions.create).not.toHaveBeenCalled();
  });

  it('refreshes Composer scope when the exact Scene changes between Workspace surfaces', async () => {
    const authoringComposerConfiguration: DshComposerConfigurationProjection = {
      ...composerConfiguration,
      context: {
        ...composerConfiguration.context!,
        workspaceLabel: 'Character Studio',
      },
    };
    dshSessions.getComposerConfiguration
      .mockResolvedValueOnce(composerConfiguration)
      .mockResolvedValueOnce(authoringComposerConfiguration);
    const view = renderWithoutSnapshots(
      <DshComposerPresentationSnapshotProvider>
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          sceneId="scene-workspace"
          agentSurfaceId="surface-draft"
          surfaceKind="workspace"
        />
      </DshComposerPresentationSnapshotProvider>,
    );
    expect(await screen.findByText('My Film')).toBeTruthy();

    view.rerender(
      <DshComposerPresentationSnapshotProvider>
        <DesktopAgentSurface
          workbenchInstanceId="workbench-1"
          sceneId="scene-character-authoring"
          agentSurfaceId="surface-draft"
          surfaceKind="workspace"
        />
      </DshComposerPresentationSnapshotProvider>,
    );

    expect(screen.queryByText('My Film')).toBeNull();
    expect(await screen.findByText('Character Studio')).toBeTruthy();
    expect(dshSessions.getComposerConfiguration).toHaveBeenCalledTimes(2);
  });

  it('refreshes only the matching Workspace Canvas catalog after creation without starting a Turn', async () => {
    const exactCanvasTarget = {
      kind: 'exact-canvas' as const,
      workspaceId: 'workspace-1',
      canvasId: 'test.nkc',
    };
    dshSessions.getComposerConfiguration
      .mockResolvedValueOnce(composerConfiguration)
      .mockResolvedValueOnce({
        ...composerConfiguration,
        context: {
          ...composerConfiguration.context!,
          canvas: {
            ...composerConfiguration.context!.canvas,
            options: [
              ...composerConfiguration.context!.canvas.options,
              { target: exactCanvasTarget, label: 'test.nkc' },
            ],
          },
        },
      });
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-workspace"
        agentSurfaceId="surface-draft"
        surfaceKind="workspace"
      />,
    );

    expect(await screen.findByText('My Film')).toBeTruthy();
    expect(dshSessions.getComposerConfiguration).toHaveBeenCalledOnce();

    await act(async () => canvasWorkspaceIndexListener?.({ workspaceId: 'workspace-other' }));
    expect(dshSessions.getComposerConfiguration).toHaveBeenCalledOnce();

    await act(async () => canvasWorkspaceIndexListener?.({ workspaceId: 'workspace-1' }));
    expect(await screen.findByRole('option', { name: 'test.nkc' })).toBeTruthy();
    expect(dshSessions.getComposerConfiguration).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByRole('combobox', { name: 'Canvas index' }), {
      target: { value: exactCanvasTarget.canvasId },
    });
    expect(dshSessions.getComposerConfiguration).toHaveBeenCalledTimes(2);
    expect(dshSessions.create).not.toHaveBeenCalled();
    expect(dshSessions.submit).not.toHaveBeenCalled();
  });

  it('passes the complete Entry context presentation to the retained selector components', async () => {
    const loadCharacterTargets = vi.fn(async () => ({
      targets: [
        {
          globalCharacterId: 'global-character-1',
          characterVersionId: 'character-version-1',
          displayName: 'Neko',
          versionLabel: 'Published v1',
          lineage: {
            coverage: 'complete' as const,
            state: 'declared-root' as const,
            isHead: true,
            path: [{ characterVersionId: 'character-version-1', label: 'Published v1' }],
          },
          storylines: [],
        },
      ],
      diagnostics: [],
    }));
    const loadWorldTargets = vi.fn(async () => ({ targets: [], diagnostics: [] }));
    const { container } = render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-draft"
        surfaceKind="entry"
        entryContext={{
          workspace: { projects: [] },
          experimentalCreative: { loadCharacterTargets, loadWorldTargets },
        }}
      />,
    );

    await waitFor(() =>
      expect(
        (container.querySelector('[data-entry-context-action="character"]') as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(
      container.querySelector('[data-entry-context-action="character"]') as HTMLButtonElement,
    );
    expect(await screen.findByText('Neko')).toBeTruthy();
    expect(loadCharacterTargets).toHaveBeenCalledOnce();
    expect(loadWorldTargets).not.toHaveBeenCalled();
    expect(dshSessions.create).not.toHaveBeenCalled();
  });

  it('adopts an exact Character detail handoff before acknowledging consumption', async () => {
    const onCharacterDialogueHandoffConsumed = vi.fn();
    dshSessions.getComposerConfiguration.mockResolvedValueOnce(entryComposerConfiguration);
    const { container } = render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-character-handoff"
        agentSurfaceId="surface-character-handoff"
        surfaceKind="entry"
        characterDialogueHandoff={{
          kind: 'character-dialogue',
          intentId: 'intent-character-handoff',
          label: 'Neko',
          binding: {
            kind: 'character-dialogue',
            mode: 'companion',
            participants: [
              {
                globalCharacterId: 'global-character-1',
                characterVersionId: 'character-version-1',
              },
            ],
          },
        }}
        onCharacterDialogueHandoffConsumed={onCharacterDialogueHandoffConsumed}
      />,
    );

    await waitFor(() =>
      expect(
        container.querySelector('[data-entry-binding-kind="character-dialogue"][title="Neko"]'),
      ).toBeTruthy(),
    );
    expect(onCharacterDialogueHandoffConsumed).toHaveBeenCalledWith('intent-character-handoff');
    expect(dshSessions.create).not.toHaveBeenCalled();
  });

  it('projects content context and changes models and DSH permissions through Host ports', async () => {
    dshSessions.getSnapshot.mockResolvedValueOnce({
      conversationId: projection.conversationId,
      dshSessionId: projection.dshSessionId,
      title: projection.title,
      inbox: { nextTurn: [], nextStep: [] },
      events: projection.events,
    });
    const { container } = render(
      <DesktopAgentSurface
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        sceneId="scene-1"
        workbenchInstanceId="workbench-1"
        surfaceKind="workspace"
      />,
    );
    expect(await screen.findByText('My Film')).toBeTruthy();
    expect(screen.getByText('Board')).toBeTruthy();
    expect(container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Configure models' }));
    fireEvent.click(screen.getByRole('radio', { name: 'GPT-5' }));
    await waitFor(() =>
      expect(dshSessions.selectComposerModel).toHaveBeenCalledWith(
        'workbench-1',
        'surface-1',
        'openai:gpt-5',
      ),
    );
    if (!screen.queryByRole('tab', { name: 'Image' })) {
      fireEvent.click(screen.getByRole('button', { name: 'Configure models' }));
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    expect(screen.queryByRole('radio', { name: 'GPT-5' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'GPT Image 2' }));
    await waitFor(() =>
      expect(dshSessions.selectComposerMediaModel).toHaveBeenCalledWith(
        'workbench-1',
        'surface-1',
        'image',
        'nekoapi-media:gpt-image-2',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Execution mode' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Full access' }));
    await waitFor(() =>
      expect(dshSessions.selectComposerPermissionPreset).toHaveBeenCalledWith(
        'workbench-1',
        'surface-1',
        'danger-full-access',
      ),
    );
    expect(
      (screen.getByRole('button', { name: 'Attach file' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('submits the first Draft message atomically through create', async () => {
    const createdProjection: DshSessionHostProjection = {
      ...projection,
      conversationId: 'conversation-created',
      dshSessionId: 'dsh-session-created',
    };
    dshSessions.create.mockResolvedValueOnce(createdProjection);
    dshSessions.submit.mockRejectedValueOnce(
      new Error('First Draft input must not use a second submit request.'),
    );
    dshPermissions.list.mockResolvedValueOnce([]);
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-draft"
        surfaceKind="entry"
      />,
    );

    const composer = screen.getByLabelText('Message');
    await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(composer, { target: { value: '  first message  ' } });
    fireEvent.click(screen.getByLabelText('Send (Enter)'));

    await waitFor(() =>
      expect(dshSessions.create).toHaveBeenCalledWith(
        'workbench-1',
        'surface-draft',
        'workspace-write',
        { kind: 'surface' },
        {
          kind: 'message',
          text: 'first message',
          references: [],
          images: [],
          contextPayloads: [],
          canvasTurnTarget: workspaceBoardTarget,
        },
      ),
    );
    expect(dshSessions.submit).not.toHaveBeenCalled();
    expect(dshPermissions.list).toHaveBeenCalledWith('conversation-created');
    expect(await screen.findByText('Create a node')).toBeTruthy();
  });

  it('creates the first Entry Conversation for the exact selected Project', async () => {
    const createdProjection: DshSessionHostProjection = {
      ...projection,
      conversationId: 'conversation-project',
      dshSessionId: 'dsh-session-project',
    };
    dshSessions.create.mockResolvedValueOnce(createdProjection);
    dshSessions.submit.mockRejectedValueOnce(
      new Error('First Project input must not use a second submit request.'),
    );
    dshPermissions.list.mockResolvedValueOnce([]);
    const { container } = render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-project-draft"
        surfaceKind="entry"
        entryContext={{
          workspace: { projects: [{ projectId: 'project-1', label: 'Project One' }] },
          experimentalCreative: {
            loadCharacterTargets: vi.fn(async () => ({ targets: [], diagnostics: [] })),
            loadWorldTargets: vi.fn(async () => ({ targets: [], diagnostics: [] })),
          },
        }}
      />,
    );

    const composer = screen.getByLabelText('Message');
    await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('tab', { name: 'Creation' }));
    fireEvent.click(
      container.querySelector('[data-entry-context-action="project"]') as HTMLButtonElement,
    );
    fireEvent.click(screen.getByTitle('Project One'));
    fireEvent.change(composer, { target: { value: '  create in project  ' } });
    fireEvent.click(screen.getByLabelText('Send (Enter)'));

    await waitFor(() =>
      expect(dshSessions.create).toHaveBeenCalledWith(
        'workbench-1',
        'surface-project-draft',
        'workspace-write',
        { kind: 'project', projectId: 'project-1' },
        {
          kind: 'message',
          text: 'create in project',
          references: [],
          images: [],
          contextPayloads: [],
          canvasTurnTarget: workspaceBoardTarget,
        },
      ),
    );
    expect(dshSessions.submit).not.toHaveBeenCalled();
  });

  it('fails locally instead of rendering a permission from another DSH Session', async () => {
    dshPermissions.list.mockResolvedValueOnce([
      { ...permission, dshSessionId: 'dsh-session-other', title: 'Stale permission' },
    ]);
    render(
      <DesktopAgentSurface
        workbenchInstanceId="workbench-1"
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
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
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
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
        sceneId="scene-1"
        agentSurfaceId="surface-1"
        conversationId="conversation-1"
        surfaceKind="workspace"
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
