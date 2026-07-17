import { describe, expect, it, vi } from 'vitest';
import type {
  AgentCapabilityContext,
  CutCanvasDraftImportResult,
  NekoCutAPI,
  ToolResult,
} from '@neko/shared';
import {
  MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  TOOL_NAMES_TIMELINE,
} from '@neko/shared';
import { createNekoCutCapabilityProvider } from './agentCapabilityProvider';
import type { TimelineToolBridge } from './services/timelineToolBridge';

function createApi(): NekoCutAPI {
  return {
    projectQuality: {
      validateProject: vi.fn(async () => {
        throw new Error('Not exercised by capability provider tests.');
      }),
      getProjectSnapshot: vi.fn(async () => {
        throw new Error('Not exercised by capability provider tests.');
      }),
      renderPreview: vi.fn(async () => {
        throw new Error('Not exercised by capability provider tests.');
      }),
      probeRuntime: vi.fn(async () => {
        throw new Error('Not exercised by capability provider tests.');
      }),
      checkExportReadiness: vi.fn(async () => {
        throw new Error('Not exercised by capability provider tests.');
      }),
    },
    authoring: {
      importGeneratedClip: vi.fn(async () => {
        throw new Error('Not exercised by capability provider tests.');
      }),
    },
    timeline: {
      getInfo: vi.fn(async () => ({
        documentUri: 'file:///workspace/edit.nkv',
        projectRevision: 'revision-1',
        duration: 10,
        fps: 24,
        width: 1920,
        height: 1080,
        trackCount: 1,
      })),
      addElement: vi.fn(async () => 'elem-1'),
      updateElement: vi.fn(async () => undefined),
      deleteElement: vi.fn(async () => undefined),
      listElements: vi.fn(async () => []),
      reveal: vi.fn(async () => true),
      importCanvasDraft: vi.fn(async (): Promise<CutCanvasDraftImportResult> => ({
        accepted: true,
        status: 'imported',
        projectUri: 'file:///cut.nkv',
      })),
    },
  };
}

function createContext(): AgentCapabilityContext {
  return {
    extensionContext: {},
    mediaService: undefined,
    configManager: undefined,
    embedFn: undefined,
  };
}

describe('createNekoCutCapabilityProvider', () => {
  it('registers advanced timeline tools through the capability provider', () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({ success: true })),
    } as unknown as TimelineToolBridge;

    const provider = createNekoCutCapabilityProvider(createApi(), bridge);
    const names = provider.getTools(createContext()).map((tool) => tool.name);

    expect(names).toContain(TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO);
    expect(names).toContain(TOOL_NAMES_TIMELINE.CUT_GET_TIMELINE_INFO);
    expect(names).toContain(TOOL_NAMES_TIMELINE.CUT_IMPORT_CANVAS_DRAFT);
    expect(names).toContain(TOOL_NAMES_TIMELINE.CUT_REVEAL_TIMELINE);
    expect(names).toContain(TOOL_NAMES_TIMELINE.ADD_EFFECT);
    expect(names).toContain(TOOL_NAMES_TIMELINE.ADD_TRACK);
    expect(names).toContain(TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION);
    expect(names).toContain(TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES);
  });

  it('marks Canvas draft import as confirmation-gated while route/info actions stay read-only', async () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({ success: true })),
    } as unknown as TimelineToolBridge;
    const api = createApi();
    const provider = createNekoCutCapabilityProvider(api, bridge);
    const tools = provider.getTools(createContext());

    const importTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_TIMELINE.CUT_IMPORT_CANVAS_DRAFT,
    );
    const revealTool = tools.find((tool) => tool.name === TOOL_NAMES_TIMELINE.CUT_REVEAL_TIMELINE);
    const infoTool = tools.find((tool) => tool.name === TOOL_NAMES_TIMELINE.CUT_GET_TIMELINE_INFO);

    expect(importTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });
    expect(revealTool).toMatchObject({ isReadOnly: true, safetyKind: 'read-only-query' });
    expect(infoTool).toMatchObject({ isReadOnly: true, safetyKind: 'read-only-query' });

    const result = await importTool!.execute({
      draft: { kind: 'canvas-cut-draft', schemaVersion: 1 },
      documentUri: 'file:///workspace/edit.nkv',
      expectedProjectRevision: 'revision-1',
    });
    expect(result.success).toBe(true);
    expect(api.timeline.importCanvasDraft).toHaveBeenCalled();
  });

  it('routes timeline tool execution through TimelineToolBridge', async () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({
        success: true,
        data: { trackId: 'track-a' },
      })),
    } as unknown as TimelineToolBridge;

    const provider = createNekoCutCapabilityProvider(createApi(), bridge);
    const addTrackTool = provider
      .getTools(createContext())
      .find((tool) => tool.name === TOOL_NAMES_TIMELINE.ADD_TRACK);

    expect(addTrackTool).toBeDefined();

    const result = await addTrackTool!.execute({
      type: 'audio',
      documentUri: 'file:///workspace/edit.nkv',
      expectedProjectRevision: 'revision-1',
    });
    expect(result.success).toBe(true);
    expect(bridge.executeAgentTool).toHaveBeenCalledWith(TOOL_NAMES_TIMELINE.ADD_TRACK, {
      type: 'audio',
      documentUri: 'file:///workspace/edit.nkv',
      expectedProjectRevision: 'revision-1',
    });
  });

  it('does not recreate media generation inside the Cut capability provider', () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({ success: true })),
    } as unknown as TimelineToolBridge;
    const mediaService = {
      generateImage: vi.fn(async () => ({ id: 'image-task' })),
      generateVideo: vi.fn(async () => ({ id: 'video-task' })),
      waitForTask: vi.fn(async () => ({ status: 'completed' })),
    };

    const provider = createNekoCutCapabilityProvider(createApi(), bridge);
    const names = provider
      .getTools({ ...createContext(), mediaService } as AgentCapabilityContext)
      .map((tool) => tool.name);

    expect(names).not.toContain('GenerateVideoForClip');
    expect(mediaService.generateVideo).not.toHaveBeenCalled();
    expect(mediaService.waitForTask).not.toHaveBeenCalled();
  });

  it('declares artifact facets without loading timeline implementations', () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({ success: true })),
    } as unknown as TimelineToolBridge;
    const provider = createNekoCutCapabilityProvider(createApi(), bridge);

    expect(provider.getArtifactFacets?.(createContext())).toMatchObject({
      renderers: [
        {
          id: 'renderer:neko-cut:generic-artifact-preview',
          accepts: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
          profiles: [
            MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
            MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
            MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
            STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
          ],
          lazy: true,
        },
      ],
      projectors: [
        {
          id: 'projector:storyboard-to-cut',
          accepts: ['StoryboardTable'],
          produces: ['CutStoryboardImportPayload'],
          profiles: [STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID],
          lazy: true,
        },
      ],
      capabilities: [
        expect.objectContaining({
          capabilityId: 'cut.importStoryboard',
          actions: ['cut.importStoryboard'],
          requiresApproval: true,
        }),
        expect.objectContaining({
          capabilityId: 'cut.importCanvasDraft',
          actions: ['cut.importCanvasDraft'],
          accepts: ['CanvasCutDraftPayload'],
          risk: 'medium',
          requiresApproval: true,
        }),
        expect.objectContaining({
          capabilityId: 'cut.revealTimeline',
          actions: ['cut.revealTimeline'],
          risk: 'low',
          requiresApproval: false,
        }),
        expect.objectContaining({
          capabilityId: 'cut.getTimelineInfo',
          actions: ['cut.getTimelineInfo'],
          risk: 'low',
          requiresApproval: false,
        }),
      ],
    });
    expect(bridge.executeAgentTool).not.toHaveBeenCalled();
  });
});
