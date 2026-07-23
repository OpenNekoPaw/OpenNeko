import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { TimelineView } from '@neko-cut/domain';
import { describe, expect, it } from 'vitest';
import { projectCutAgentContext } from './cutAgentContext';

describe('Cut Agent context projection', () => {
  it('projects an explicit Clip locator and revision without a writable OTIO document', () => {
    const payload = projectCutAgentContext(view(), {
      kind: 'clip',
      trackId: 'track-video',
      clipId: 'clip-video',
    });

    expect(payload).toMatchObject({
      type: 'cut-clip',
      id: 'file:///workspace/cut.otio#clip=clip-video',
      label: 'Opening',
      data: {
        schemaVersion: 1,
        document: {
          documentUri: 'file:///workspace/cut.otio',
          sessionId: 'session-1',
          revision: 7,
        },
        selection: {
          kind: 'clip',
          trackId: 'track-video',
          clipId: 'clip-video',
        },
      },
    });
    expect(payload.data).not.toHaveProperty('timeline');
    expect(payload.data).not.toHaveProperty('document.tracks');
  });

  it('fails visibly for a stale selection instead of inferring another Track or Clip', () => {
    expect(() =>
      projectCutAgentContext(view(), {
        kind: 'clip',
        trackId: 'track-video',
        clipId: 'missing',
      }),
    ).toThrow('Agent context Clip missing is unavailable');
  });

  it('routes the Webview intent through the shared Agent context command only', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./CutOtioEditorProvider.ts', import.meta.url)),
      'utf8',
    );
    const start = source.indexOf("value['type'] === 'cut:send-to-agent'");
    expect(start).toBeGreaterThanOrEqual(0);
    const branch = source.slice(start, start + 700);

    expect(branch).toContain('assertCurrentIdentity');
    expect(branch).toContain('projectCutAgentContext');
    expect(branch).toContain("'neko.agent.sendContext'");
    expect(branch).not.toContain('executeAIAction');
    expect(branch).not.toContain('activeTextEditor');
  });
});

function view(): TimelineView {
  return {
    documentUri: 'file:///workspace/cut.otio',
    sessionId: 'session-1',
    revision: 7,
    name: 'Cut',
    durationSeconds: 4,
    tracks: [
      {
        trackId: 'track-video',
        name: 'Video 1',
        kind: 'Video',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          {
            kind: 'clip',
            clipId: 'clip-video',
            name: 'Opening',
            targetUrl: '../media/opening.mp4',
            startSeconds: 1,
            durationSeconds: 3,
            sourceStartSeconds: 0,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: {
              muted: false,
              gainDb: 0,
              fadeInSeconds: 0,
              fadeOutSeconds: 0,
            },
          },
        ],
      },
    ],
  };
}
