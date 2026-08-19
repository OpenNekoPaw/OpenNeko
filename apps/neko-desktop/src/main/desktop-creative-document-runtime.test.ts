import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopShellProjection } from '@neko/host/desktop-shell-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';
import { openDesktopCanvasDocument } from './desktop-creative-document-runtime';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('openDesktopCanvasDocument', () => {
  it('opens and then focuses one exact authorized Canvas View', async () => {
    const workspacePath = await realpath(
      await mkdtemp(path.join(tmpdir(), 'openneko-canvas-document-open-')),
    );
    roots.push(workspacePath);
    const documentId = 'boards/story.nkc';
    const absolutePath = path.join(workspacePath, documentId);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, '{}', 'utf8');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const projection = (): DesktopShellProjection => ({
      applicationInstanceId: 'application-1',
      rendererSessionId: 'endpoint-1',
      catalog: {
        projects: [
          {
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Fixture',
            createdAt: '2026-08-08T00:00:00.000Z',
            updatedAt: '2026-08-08T00:00:00.000Z',
          },
        ],
      },
      window: {
        windowId: 'window-1',
        activeTarget: { kind: 'project', tabId: 'tab-1' },
        tabs: [
          {
            tabId: 'tab-1',
            projectId: 'project-1',
            viewId: 'project-view-1',
            viewInstanceId: 'view-instance-1',
          },
        ],
        workbench: createDesktopWindowComposition({
          workbenchInstanceId: 'workbench:workspace-1',
          layout: workbench,
          scene: parseDesktopWorkbenchSceneProjection({
            sceneId: 'scene:workspace-1',
            windowId: 'window-1',
            context: {
              kind: 'agent',
              agentViewId: 'project-view-1',
              scope: {
                kind: 'workspace',
                draftId: 'draft:workspace-1',
                workspaceId: 'workspace-1',
                workspaceGrantId: 'workspace-grant:workspace-1',
              },
            },
            slots: {
              interaction: {
                kind: 'agent',
                agentSurfaceId: 'agent-surface:workspace-1',
                agentViewId: 'project-view-1',
                phase: 'draft',
                scope: {
                  kind: 'workspace',
                  draftId: 'draft:workspace-1',
                  workspaceId: 'workspace-1',
                  workspaceGrantId: 'workspace-grant:workspace-1',
                },
              },
              rightManager: { kind: 'workspace-resources', workspaceId: 'workspace-1' },
              status: { kind: 'scene-status', sceneId: 'scene:workspace-1' },
            },
          }),
        }),
        applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
      },
      agentHome: { conversations: [], attention: { needsInput: 0, needsReview: 0, running: 0 } },
      conversationNavigation: { recentProjectIds: [], groups: [] },
      domains: [],
    });
    const updateWorkbench = vi.fn(async (_windowId, _sessionId, _instanceId, next) => {
      workbench = next;
      return projection();
    });
    const shell = {
      getProjection: vi.fn(async () => projection()),
      resolveAgentWorkspace: vi.fn(async () => ({
        workspaceId: 'workspace-1',
        workspacePath,
        displayName: 'Fixture',
        locator: { kind: 'relative' as const, value: '.' },
      })),
      updateWorkbench,
    };
    const request = {
      shell,
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'resource-browser:project-view-1',
        viewInstanceId: 'view-instance-1',
        rendererSessionId: 'endpoint-1',
      },
      item: {
        resourceId: 'content:story',
        source: 'files' as const,
        role: 'content' as const,
        depth: 1,
        kind: 'document' as const,
        label: 'story.nkc',
        locator: { file: { authority: 'workspace' as const, path: documentId } },
        capabilities: ['open-creative-document'] as const,
      },
      absolutePath,
    };

    await openDesktopCanvasDocument(request);
    await openDesktopCanvasDocument(request);

    expect(workbench.main.views).toEqual([
      expect.objectContaining({ kind: 'canvas', documentId, displayLabel: 'story.nkc' }),
    ]);
    expect(updateWorkbench).toHaveBeenCalledTimes(2);
    await expect(
      openDesktopCanvasDocument({
        ...request,
        absolutePath: path.join(workspacePath, 'other.nkc'),
      }),
    ).rejects.toThrow('does not match');
  });
});
