import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantResourceRuntime } from '@neko/agent-contracts/assistant-resource-host';
import { AssistantResourcesRoot } from './root';

describe('AssistantResourcesRoot', () => {
  it('keeps draft empty without reading a Conversation runtime', () => {
    render(<AssistantResourcesRoot assistantSpaceId="assistant:1" locale="en" />);

    expect(screen.getByText('No resources in this new conversation')).toBeTruthy();
    expect(screen.getByRole('region').getAttribute('data-assistant-resources-phase')).toBe('draft');
  });

  it('renders bounded grants and authorizes exact scratch Preview identity', async () => {
    const authorizeScratchPreview = vi.fn(async () => previewProjection());
    const runtime: AssistantResourceRuntime = {
      identity: {
        assistantSpaceId: 'assistant:1',
        conversationId: 'conversation:1',
        windowId: 'window:1',
      },
      getSnapshot: vi.fn(async () => ({
        schemaVersion: 1 as const,
        identity: {
          assistantSpaceId: 'assistant:1',
          conversationId: 'conversation:1',
          windowId: 'window:1',
        },
        baseGrants: [
          {
            schemaVersion: 1 as const,
            resourceGrantId: 'grant:1',
            assistantSpaceId: 'assistant:1',
            kind: 'file' as const,
            label: 'notes.txt',
          },
        ],
        scratchArtifacts: [
          {
            schemaVersion: 1 as const,
            scratchArtifactId: 'scratch:1',
            assistantSpaceId: 'assistant:1',
            conversationId: 'conversation:1',
            label: 'result.txt',
            state: 'recoverable' as const,
          },
        ],
      })),
      authorizeScratchPreview,
    };

    render(<AssistantResourcesRoot assistantSpaceId="assistant:1" locale="en" runtime={runtime} />);
    await screen.findByText('notes.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Preview result.txt' }));

    await waitFor(() => expect(authorizeScratchPreview).toHaveBeenCalledWith('scratch:1'));
    expect(document.body.textContent).not.toContain('/Users/');
  });
});

function previewProjection() {
  return {
    schemaVersion: 1 as const,
    identity: {
      previewSessionId: 'preview:1',
      windowId: 'window:1',
      owner: {
        kind: 'assistant-scratch' as const,
        assistantSpaceId: 'assistant:1',
        conversationId: 'conversation:1',
        scratchArtifactId: 'scratch:1',
      },
      revision: 0,
    },
    status: 'unavailable' as const,
    diagnostic: { code: 'preview-unsupported-kind' as const, message: 'unsupported' },
  };
}
