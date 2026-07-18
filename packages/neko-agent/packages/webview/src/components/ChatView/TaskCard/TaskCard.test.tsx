import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundTask } from '@/components/TaskListView';
import { TaskCard } from './TaskCard';

vi.mock('@/components/ChatView/RichContent', () => ({
  RichContentRenderer: (props: { openOnClick?: boolean }) => (
    <button type="button" data-testid="result-preview" data-open-on-click={props.openOnClick}>
      preview
    </button>
  ),
}));

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vi.fn(),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'common.copy': 'Copy',
        'common.view': 'View',
        'tasks.viewInVSCode': 'View in VSCode',
        'tasks.copyResultReference': 'Copy result reference',
      };
      return messages[key] ?? key;
    },
  }),
}));

describe('TaskCard result actions', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders explicit copy and VSCode view actions for completed results', () => {
    render(<TaskCard task={createCompletedImageTask()} onViewResult={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View in VSCode' })).toBeTruthy();
  });

  it('copies the stable result reference from generated asset metadata', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<TaskCard task={createCompletedImageTask()} onViewResult={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('generated-assets/asset-1.png');
  });

  it('renders result previews without path-backed transfer actions', () => {
    render(
      <TaskCard
        task={createCompletedImageTask()}
        onViewResult={vi.fn()}
        plugins={{ canvas: true, cut: true }}
      />,
    );

    fireEvent.click(screen.getByText('tasks.imageGeneration'));

    expect(screen.getByTestId('result-preview')).toBeTruthy();
    expect(screen.getByTestId('result-preview').getAttribute('data-open-on-click')).toBe('false');
    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Timeline/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Explorer|Folder/ })).toBeNull();
    expect(screen.queryByText('tasks.revealInExplorer')).toBeNull();
    expect(screen.queryByText(/frame\.png/)).toBeNull();
  });

  it('does not open the result when clicking the inline preview', () => {
    const onViewResult = vi.fn();

    render(<TaskCard task={createCompletedImageTask()} onViewResult={onViewResult} />);

    fireEvent.click(screen.getByText('tasks.imageGeneration'));
    fireEvent.click(screen.getByTestId('result-preview'));

    expect(onViewResult).not.toHaveBeenCalled();
  });

  it('opens the result only from the explicit VSCode view button', () => {
    const onViewResult = vi.fn();

    render(<TaskCard task={createCompletedImageTask()} onViewResult={onViewResult} />);

    fireEvent.click(screen.getByRole('button', { name: 'View in VSCode' }));

    expect(onViewResult).toHaveBeenCalledWith(taskScope('task-1'), 'generated-assets/asset-1.png');
  });

  it('shows storyboard generation progress, provider metadata and task steps in Agent UI', () => {
    render(<TaskCard task={createRunningStoryboardVideoTask()} onCancel={vi.fn()} />);

    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('video-model-1')).toBeTruthy();

    fireEvent.click(screen.getByText('tasks.videoGeneration'));

    expect(screen.getByText(/Steps: 1\/3/)).toBeTruthy();
    expect(screen.getByText(/Generate video media/)).toBeTruthy();

    fireEvent.click(screen.getByText(/Steps: 1\/3/));

    expect(screen.getByText(/1\. Validate Canvas storyboard intent/)).toBeTruthy();
    expect(screen.getByText(/2\. Generate video media/)).toBeTruthy();
    expect(screen.getByText(/3\. Write structured task result to Canvas/)).toBeTruthy();
  });
});

function taskScope(childRunId: string) {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task' as const,
  };
}

function createCompletedImageTask(): BackgroundTask {
  return {
    scope: taskScope('task-1'),
    id: 'task-1',
    type: 'image',
    name: 'Generated frame',
    prompt: 'Generate a quiet interior frame.',
    providerId: 'openai',
    providerName: 'gpt-image-2',
    status: 'completed',
    progress: 100,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:01.000Z',
    result: {
      urls: ['webview-uri:/workspace/.neko/generated/image/frame.png'],
      assets: [
        {
          id: 'asset-1',
          type: 'generated-image',
          renderUri: 'webview-uri:/workspace/.neko/generated/image/frame.png',
          assetRef: {
            assetId: 'asset-1',
            uri: 'generated-assets/asset-1.png',
            mimeType: 'image/png',
          },
          mimeType: 'image/png',
          generatedAt: '2026-06-20T00:00:01.000Z',
          width: 1024,
          height: 1024,
          ratio: '1:1',
        },
      ],
      width: 1024,
      height: 1024,
    },
  };
}

function createRunningStoryboardVideoTask(): BackgroundTask {
  return {
    scope: taskScope('storyboard-generate-video-shot-1'),
    id: 'storyboard-generate-video-shot-1',
    type: 'video',
    name: 'Canvas storyboard: Generate Video for shot 1',
    prompt: 'Storyboard action generate-video for shot 1.',
    providerId: 'neko-video',
    providerName: 'video-model-1',
    status: 'processing',
    progress: 42,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:01.000Z',
    currentStepId: 'execute-agent-action',
    steps: [
      {
        id: 'validate-intent',
        name: 'Validate Canvas storyboard intent',
        status: 'completed',
        startTime: 1,
        endTime: 1,
      },
      {
        id: 'execute-agent-action',
        name: 'Generate video media',
        status: 'running',
        startTime: 1,
      },
      {
        id: 'writeback-canvas',
        name: 'Write structured task result to Canvas',
        status: 'pending',
      },
    ],
  };
}
