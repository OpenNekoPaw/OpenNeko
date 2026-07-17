/**
 * NekoCut Agent Capability Provider
 *
 * Provides timeline editing tools to neko-agent via the AgentCapabilityProvider protocol.
 * This replaces the `createNekoCutTools()` factory function that was previously maintained
 * inside neko-agent's extension code.
 *
 * Benefits of this approach:
 * - Tool definitions live alongside the domain code they operate on
 * - neko-cut owns its own tool naming, parameters, and semantics
 * - neko-agent doesn't need to import or know about NekoCut internals
 * - Tool registration/unregistration is automatic via the discovery service
 */

import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  AgentArtifactFacetsContribution,
  Tool,
  ToolParameters,
  NekoCutAPI,
  PromptFragment,
  CanvasCutDraftPayload,
} from '@neko/shared';
import {
  MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_REVIEW_PROFILE_ID,
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  TOOL_NAMES_CANVAS,
  TOOL_NAMES_TIMELINE,
} from '@neko/shared';
import { TimelineToolBridge } from './services/timelineToolBridge';

/**
 * Create the NekoCut capability provider.
 *
 * @param api The NekoCutAPI exports from the extension activation
 */
export function createNekoCutCapabilityProvider(
  api: NekoCutAPI,
  timelineBridge: TimelineToolBridge,
): AgentCapabilityProvider {
  return new NekoCutCapabilityProviderImpl(api, timelineBridge);
}

function createTimelineTool(
  bridge: TimelineToolBridge,
  name: string,
  description: string,
  parameters: ToolParameters,
  options: Pick<Tool, 'isReadOnly' | 'isConcurrencySafe' | 'isDestructive'> = {},
): Tool {
  const required = new Set(parameters.required ?? []);
  required.add('documentUri');
  if (options.isReadOnly !== true) required.add('expectedProjectRevision');
  return {
    name,
    description,
    category: 'timeline',
    parameters: {
      ...parameters,
      properties: {
        ...parameters.properties,
        documentUri: {
          type: 'string',
          description: 'Explicit file URI of the target .nkv project.',
        },
        expectedProjectRevision: {
          type: 'string',
          description: 'Required current project revision for timeline mutations.',
        },
      },
      required: [...required],
    },
    ...options,
    async execute(args: Record<string, unknown>) {
      return bridge.executeAgentTool(name, args);
    },
  };
}

class NekoCutCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-cut';
  readonly version = '1.0.0';

  constructor(
    private readonly _api: NekoCutAPI,
    private readonly _timelineBridge: TimelineToolBridge,
  ) {}

  getArtifactFacets(_context: AgentCapabilityContext): AgentArtifactFacetsContribution {
    return {
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
        {
          capabilityId: 'cut.importStoryboard',
          packageId: 'neko-cut',
          accepts: ['CutStoryboardImportPayload'],
          produces: ['timeline-element-ref'],
          actions: ['cut.importStoryboard'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'cut.importCanvasDraft',
          packageId: 'neko-cut',
          accepts: ['CanvasCutDraftPayload'],
          produces: ['timeline-element-ref'],
          actions: ['cut.importCanvasDraft'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'cut.revealTimeline',
          packageId: 'neko-cut',
          accepts: ['CutProjectRef'],
          actions: ['cut.revealTimeline'],
          risk: 'low',
          requiresApproval: false,
        },
        {
          capabilityId: 'cut.getTimelineInfo',
          packageId: 'neko-cut',
          accepts: ['CutProjectRef'],
          produces: ['TimelineInfo'],
          actions: ['cut.getTimelineInfo'],
          risk: 'low',
          requiresApproval: false,
        },
      ],
    };
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    const api = this._api;
    const bridge = this._timelineBridge;
    return [
      {
        name: TOOL_NAMES_TIMELINE.CUT_GET_TIMELINE_INFO,
        description: 'Get read-only information about an explicitly identified Cut timeline.',
        category: 'timeline',
        parameters: {
          type: 'object',
          properties: {
            documentUri: { type: 'string', description: 'Explicit file URI of the .nkv project.' },
          },
          required: ['documentUri'],
        },
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        async execute(args) {
          try {
            const documentUri = readOptionalString(args.documentUri);
            if (!documentUri) return { success: false, error: 'documentUri is required.' };
            const data = await api.timeline.getInfo({ documentUri });
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to get Cut timeline info: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_TIMELINE.CUT_REVEAL_TIMELINE,
        description:
          'Reveal the owning Cut timeline surface. Agent does not own Cut playback or timeline state.',
        category: 'timeline',
        parameters: {
          type: 'object',
          properties: {
            projectUri: { type: 'string', description: 'Explicit Cut project URI.' },
            sequenceId: { type: 'string', description: 'Optional sequence id to focus.' },
            clipId: { type: 'string', description: 'Optional clip id to focus.' },
          },
          required: ['projectUri'],
        },
        isReadOnly: true,
        safetyKind: 'read-only-query',
        async execute(args) {
          try {
            const projectUri = readOptionalString(args.projectUri);
            if (!projectUri) return { success: false, error: 'projectUri is required.' };
            const revealed = await api.timeline.reveal({
              projectUri,
              sequenceId: typeof args.sequenceId === 'string' ? args.sequenceId : undefined,
              clipId: typeof args.clipId === 'string' ? args.clipId : undefined,
            });
            return { success: revealed, data: { revealed } };
          } catch (err) {
            return { success: false, error: `Failed to reveal Cut timeline: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_TIMELINE.CUT_IMPORT_CANVAS_DRAFT,
        description:
          'Import a CanvasCutDraftPayload into an explicitly identified Cut project. Requires confirmation because Cut owns .nkv timeline state after import.',
        category: 'timeline',
        parameters: {
          type: 'object',
          properties: {
            draft: {
              type: 'object',
              description: 'CanvasCutDraftPayload snapshot produced by Canvas.',
            },
            documentUri: {
              type: 'string',
              description: 'Explicit file URI of the target .nkv project.',
            },
            expectedProjectRevision: {
              type: 'string',
              description: 'Current target project revision.',
            },
          },
          required: ['draft', 'documentUri', 'expectedProjectRevision'],
        },
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['draft'],
          confirmationModes: ['create-cut-project', 'update-cut-project', 'send-to-cut'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
            TOOL_NAMES_TIMELINE.CUT_GET_TIMELINE_INFO,
          ],
          reason:
            'Show Canvas route, unit count, target Cut project, and overwrite/import risk before importing.',
        },
        async execute(args) {
          try {
            const draft = args.draft as CanvasCutDraftPayload | undefined;
            if (!draft) {
              return { success: false, error: 'cut.importCanvasDraft requires a draft payload.' };
            }
            const documentUri = readOptionalString(args.documentUri);
            const expectedProjectRevision = readOptionalString(args.expectedProjectRevision);
            if (!documentUri || !expectedProjectRevision) {
              return {
                success: false,
                error: 'cut.importCanvasDraft requires documentUri and expectedProjectRevision.',
              };
            }
            const data = await api.timeline.importCanvasDraft({
              payload: draft,
              documentUri,
              expectedProjectRevision,
            });
            return { success: data.accepted, data };
          } catch (err) {
            return { success: false, error: `Failed to import Canvas draft: ${String(err)}` };
          }
        },
      },
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
        'Get information about the current video timeline',
        { type: 'object', properties: {} },
        { isReadOnly: true, isConcurrencySafe: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
        'Get detailed information about a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
          },
          required: ['elementId'],
        },
        { isReadOnly: true, isConcurrencySafe: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
        'List timeline elements with optional track/type filters',
        {
          type: 'object',
          properties: {
            trackId: { type: 'string', description: 'Optional track filter' },
            type: {
              type: 'string',
              enum: ['video', 'audio', 'image', 'text', 'shape', 'subtitle', 'media'],
              description: 'Optional element type filter',
            },
          },
        },
        { isReadOnly: true, isConcurrencySafe: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
        'Add a new element to the timeline',
        {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['video', 'audio', 'image', 'text', 'shape', 'subtitle'],
              description: 'Type of element to add',
            },
            trackId: { type: 'string', description: 'Track ID' },
            startTime: { type: 'number', description: 'Start time in seconds' },
            duration: { type: 'number', description: 'Duration in seconds' },
            source: { type: 'string', description: 'Source path or URL for media elements' },
            content: { type: 'string', description: 'Text content for text/subtitle elements' },
          },
          required: ['type', 'trackId', 'startTime', 'duration'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
        'Update an existing timeline element',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Element ID' },
            updates: { type: 'object', description: 'Partial update payload' },
          },
          required: ['id', 'updates'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT,
        'Delete an element from the timeline',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Element ID' },
          },
          required: ['id'],
        },
        { isDestructive: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.TRIM_ELEMENT,
        'Trim the in/out points of a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            trimStart: { type: 'number', description: 'Trim offset at start in seconds' },
            trimEnd: { type: 'number', description: 'Trim offset at end in seconds' },
          },
          required: ['elementId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SPLIT_ELEMENT,
        'Split a timeline element at a relative time offset',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            splitTime: { type: 'number', description: 'Split offset within the clip in seconds' },
          },
          required: ['elementId', 'splitTime'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.LIST_EFFECTS,
        'List built-in timeline effects',
        { type: 'object', properties: {} },
        { isReadOnly: true, isConcurrencySafe: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.ADD_EFFECT,
        'Add an effect to a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            effectType: { type: 'string', description: 'Effect type identifier' },
            params: { type: 'object', description: 'Effect parameter values' },
          },
          required: ['elementId', 'effectType'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.UPDATE_EFFECT,
        'Update an existing effect on a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            effectId: { type: 'string', description: 'Effect ID' },
            params: { type: 'object', description: 'Updated effect parameter values' },
          },
          required: ['elementId', 'effectId', 'params'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.REMOVE_EFFECT,
        'Remove an effect from a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            effectId: { type: 'string', description: 'Effect ID' },
          },
          required: ['elementId', 'effectId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.LIST_TRANSITIONS,
        'List available transition presets',
        { type: 'object', properties: {} },
        { isReadOnly: true, isConcurrencySafe: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SET_TRANSITION,
        'Set an in/out transition on a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            placement: {
              type: 'string',
              enum: ['in', 'out'],
              description: 'Transition placement',
            },
            type: { type: 'string', description: 'Transition type' },
            duration: { type: 'number', description: 'Transition duration in seconds' },
            easing: { type: 'string', description: 'Optional easing preset' },
            params: { type: 'object', description: 'Optional transition parameters' },
          },
          required: ['elementId', 'placement', 'type', 'duration'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.REMOVE_TRANSITION,
        'Remove an in/out transition from a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            placement: {
              type: 'string',
              enum: ['in', 'out'],
              description: 'Transition placement',
            },
          },
          required: ['elementId', 'placement'],
        },
      ),
      createTimelineTool(bridge, TOOL_NAMES_TIMELINE.ADD_TRACK, 'Create a new timeline track', {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['video', 'media', 'audio', 'subtitle', 'shape', 'text'],
            description: 'Track type',
          },
          name: { type: 'string', description: 'Optional track name' },
        },
        required: ['type'],
      }),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.DELETE_TRACK,
        'Delete a timeline track',
        {
          type: 'object',
          properties: {
            trackId: { type: 'string', description: 'Track ID' },
          },
          required: ['trackId'],
        },
        { isDestructive: true },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.REORDER_TRACKS,
        'Reorder tracks by supplying the full ordered track ID list',
        {
          type: 'object',
          properties: {
            trackIds: {
              type: 'array',
              description: 'All track IDs in their desired order',
              items: { type: 'string' },
            },
          },
          required: ['trackIds'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SET_TRACK_PROPERTIES,
        'Update timeline track properties',
        {
          type: 'object',
          properties: {
            trackId: { type: 'string', description: 'Track ID' },
            name: { type: 'string', description: 'Track name' },
            locked: { type: 'boolean', description: 'Whether the track is locked' },
            muted: { type: 'boolean', description: 'Whether the track is muted' },
          },
          required: ['trackId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION,
        'Apply color correction to a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            colorCorrection: { type: 'object', description: 'Nested color correction payload' },
            brightness: { type: 'number', description: 'Brightness adjustment' },
            contrast: { type: 'number', description: 'Contrast adjustment' },
            saturation: { type: 'number', description: 'Saturation adjustment' },
            temperature: { type: 'number', description: 'Temperature adjustment' },
            tint: { type: 'number', description: 'Tint adjustment' },
            exposure: { type: 'number', description: 'Exposure adjustment' },
            gamma: { type: 'number', description: 'Gamma adjustment' },
            shadows: { type: 'number', description: 'Shadow adjustment' },
            highlights: { type: 'number', description: 'Highlight adjustment' },
          },
          required: ['elementId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.RESET_COLOR_CORRECTION,
        'Reset color correction to defaults for a timeline element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
          },
          required: ['elementId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES,
        'Update audio properties for a media or audio element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            volume: { type: 'number', description: 'Volume percentage 0-200' },
            pan: { type: 'number', description: 'Pan percentage -100 to 100' },
            muted: { type: 'boolean', description: 'Mute state' },
            fadeIn: { type: 'number', description: 'Fade-in duration in seconds' },
            fadeOut: { type: 'number', description: 'Fade-out duration in seconds' },
          },
          required: ['elementId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SEPARATE_AUDIO,
        'Separate embedded audio from a media element into an audio track',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Media element ID' },
            targetTrackId: {
              type: 'string',
              description: 'Optional target audio track ID',
            },
          },
          required: ['elementId'],
        },
      ),
      createTimelineTool(
        bridge,
        TOOL_NAMES_TIMELINE.SET_PLAYBACK_SPEED,
        'Set playback speed for a media or audio element',
        {
          type: 'object',
          properties: {
            elementId: { type: 'string', description: 'Element ID' },
            speed: { type: 'number', description: 'Playback speed multiplier' },
          },
          required: ['elementId', 'speed'],
        },
      ),
    ];
  }

  /**
   * PR3e: domain-specific usage conventions for the cut.* timeline tools,
   * injected into the agent's L3 environment layer at priority 70. The
   * agent sees this guidance alongside the tool definitions themselves so
   * that calls to `AddTimelineElement`, `TrimElement`, `SetTransition`,
   * etc. follow the same conventions the editor UI assumes.
   */
  getPromptFragments(): PromptFragment[] {
    return [
      {
        id: 'neko-cut:timeline-basics',
        content: [
          '## Timeline editing (neko-cut)',
          '',
          'When using `cut.*` timeline tools:',
          '',
          '- Timestamps are in **milliseconds**. When the user says "1.5 seconds",',
          '  emit `1500`, not `1.5`.',
          '- Add tracks before inserting elements. Tracks are the primary',
          '  ordering axis; element positions are meaningless without a track.',
          '- Effects stack in declaration order; later entries draw on top.',
          '- When in doubt about the current timeline state, call',
          '  `GetTimelineInfo` or `ListTimelineElements` instead of guessing.',
        ].join('\n'),
        priority: 70,
      },
    ];
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
