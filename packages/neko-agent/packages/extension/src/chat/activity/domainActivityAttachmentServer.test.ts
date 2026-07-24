import { describe, expect, it, vi } from 'vitest';
import { createDomainActivityProjector } from '@neko/shared/domain-activity';
import type { DomainActivityItem } from '@neko/shared/domain-activity';
import { createDomainActivityAttachmentServer } from './domainActivityAttachmentServer';

describe('DomainActivityAttachmentServer', () => {
  it('installs a snapshot and waits for exact ACK before delivering ordered patches', async () => {
    const projector = createDomainActivityProjector();
    const messages: unknown[] = [];
    const server = createDomainActivityAttachmentServer({
      source: projector,
      commands: { execute: vi.fn() },
      postMessage: async (message) => {
        messages.push(message);
        return true;
      },
      reportError: vi.fn(),
    });

    await server.attach({
      type: 'domainActivityAttach',
      key: { attachmentId: 'activity-1' },
    });
    projector.publish(activity());
    await Promise.resolve();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'domainActivitySnapshot',
      sequence: 0,
      snapshot: { projectionVersion: 0, items: [] },
    });

    await server.acknowledge({
      type: 'domainActivityAck',
      key: { attachmentId: 'activity-1' },
      sequence: 0,
      projectionVersion: 0,
    });
    await waitFor(() => messages.length === 2);
    expect(messages[1]).toMatchObject({
      type: 'domainActivityPatch',
      sequence: 1,
      patch: {
        baseProjectionVersion: 0,
        projectionVersion: 1,
        upserts: [{ jobKind: 'generation', jobId: 'generation-1' }],
      },
    });

    await expect(
      server.acknowledge({
        type: 'domainActivityAck',
        key: { attachmentId: 'activity-1' },
        sequence: 0,
        projectionVersion: 0,
      }),
    ).rejects.toThrow('acknowledgement mismatch');
    await server.dispose();
  });

  it('forwards exact command identity and returns fail-visible errors', async () => {
    const projector = createDomainActivityProjector();
    const execute = vi.fn().mockRejectedValue(new Error('stale revision: export-1 is at 4, not 3'));
    const messages: unknown[] = [];
    const server = createDomainActivityAttachmentServer({
      source: projector,
      commands: { execute },
      postMessage: async (message) => {
        messages.push(message);
        return true;
      },
      reportError: vi.fn(),
    });

    await server.executeCommand({
      type: 'domainJobCommand',
      requestId: 'command-1',
      jobKind: 'export',
      jobId: 'export-1',
      expectedRevision: 3,
      command: 'cancel',
    });

    expect(execute).toHaveBeenCalledWith({
      type: 'domainJobCommand',
      requestId: 'command-1',
      jobKind: 'export',
      jobId: 'export-1',
      expectedRevision: 3,
      command: 'cancel',
    });
    expect(messages).toEqual([
      {
        type: 'domainJobCommandResult',
        requestId: 'command-1',
        success: false,
        error: 'stale revision: export-1 is at 4, not 3',
      },
    ]);
  });
});

function activity(): DomainActivityItem {
  return {
    jobKind: 'generation',
    jobId: 'generation-1',
    phase: 'pending',
    jobRevision: 1,
    createdAt: 100,
    updatedAt: 100,
    label: 'image generation',
    mediaKind: 'image',
    progress: { stage: 'queued', percent: 0 },
    supportedCommands: [],
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Condition was not met.');
}
