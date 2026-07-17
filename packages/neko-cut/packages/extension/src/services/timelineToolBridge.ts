import type {
  NekoCutTimelineElement,
  CutTimelineDocumentTarget,
  TimelineElementConfig,
  TimelineElementUpdate,
  TimelineInfo,
  ToolResult,
} from '@neko/shared';
import { TOOL_NAMES_TIMELINE } from '@neko/shared';

type InternalToolCall = {
  toolName: string;
  params: Record<string, unknown>;
};

export interface TimelineToolRunner {
  execute(
    toolName: string,
    params: Record<string, unknown>,
    target: CutTimelineDocumentTarget,
  ): Promise<ToolResult>;
}

function normalizeElementType(type: TimelineElementConfig['type']): string {
  return type === 'video' || type === 'image' ? 'media' : type;
}

function defaultTrackName(type: string): string {
  switch (type) {
    case 'audio':
      return 'Audio';
    case 'subtitle':
      return 'Subtitles';
    case 'text':
      return 'Text';
    case 'shape':
      return 'Shapes';
    default:
      return 'Media';
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeListElementsData(data: unknown): NekoCutTimelineElement[] {
  if (Array.isArray(data)) {
    return data as NekoCutTimelineElement[];
  }

  const elements = asRecord(data)?.elements;
  return Array.isArray(elements) ? (elements as NekoCutTimelineElement[]) : [];
}

function buildPublicUpdateCalls(
  elementId: string,
  updates: TimelineElementUpdate,
): InternalToolCall[] {
  const calls: InternalToolCall[] = [];
  const baseParams: Record<string, unknown> = { elementId };

  if (updates.startTime !== undefined) baseParams.startTime = updates.startTime;
  if (updates.duration !== undefined) baseParams.duration = updates.duration;
  if (updates.transform !== undefined) baseParams.transform = updates.transform;
  if (updates.content !== undefined) baseParams.content = updates.content;
  if (updates.opacity !== undefined) baseParams.opacity = updates.opacity;

  if (Object.keys(baseParams).length > 1) {
    calls.push({ toolName: 'UpdateElement', params: baseParams });
  }

  const transitionIn = asRecord(updates.transitionIn);
  if (transitionIn) {
    calls.push({
      toolName: 'SetTransition',
      params: {
        elementId,
        placement: 'in',
        type: transitionIn.type,
        duration: transitionIn.duration,
        easing: transitionIn.easing,
        params: transitionIn.params,
      },
    });
  } else if (updates.transitionIn === null) {
    calls.push({
      toolName: 'RemoveTransition',
      params: { elementId, placement: 'in' },
    });
  }

  const transitionOut = asRecord(updates.transitionOut);
  if (transitionOut) {
    calls.push({
      toolName: 'SetTransition',
      params: {
        elementId,
        placement: 'out',
        type: transitionOut.type,
        duration: transitionOut.duration,
        easing: transitionOut.easing,
        params: transitionOut.params,
      },
    });
  } else if (updates.transitionOut === null) {
    calls.push({
      toolName: 'RemoveTransition',
      params: { elementId, placement: 'out' },
    });
  }

  if (updates.trimStart !== undefined || updates.trimEnd !== undefined) {
    calls.push({
      toolName: 'TrimElement',
      params: {
        elementId,
        ...(updates.trimStart !== undefined && { trimStart: updates.trimStart }),
        ...(updates.trimEnd !== undefined && { trimEnd: updates.trimEnd }),
      },
    });
  }

  if (typeof updates.speed === 'number') {
    calls.push({
      toolName: 'SetPlaybackSpeed',
      params: { elementId, speed: updates.speed },
    });
  }

  const colorCorrection = asRecord(updates.colorCorrection);
  if (colorCorrection) {
    calls.push({
      toolName: 'SetColorCorrection',
      params: { elementId, colorCorrection },
    });
  }

  const audio = asRecord(updates.audio);
  if (audio) {
    calls.push({
      toolName: 'SetAudioProperties',
      params: { elementId, ...audio },
    });
  } else if (typeof updates.muted === 'boolean') {
    calls.push({
      toolName: 'SetAudioProperties',
      params: { elementId, muted: updates.muted },
    });
  }

  return calls;
}

export class TimelineToolBridge {
  constructor(
    private readonly runner: TimelineToolRunner,
    private readonly defaultTarget?: CutTimelineDocumentTarget,
  ) {}

  async getInfo(target: CutTimelineDocumentTarget): Promise<TimelineInfo> {
    const result = await this.executeOrThrow<TimelineInfo>('GetTimelineInfo', {}, target);
    return result.data as TimelineInfo;
  }

  async listElements(target: CutTimelineDocumentTarget): Promise<NekoCutTimelineElement[]> {
    const result = await this.executeOrThrow('ListElements', {}, target);
    return normalizeListElementsData(result.data);
  }

  async addElement(
    target: CutTimelineDocumentTarget,
    config: TimelineElementConfig,
  ): Promise<string> {
    const result = await this.executeOrThrow<{ elementId?: string }>(
      'AddElement',
      {
        trackId: config.trackId,
        type: normalizeElementType(config.type),
        startTime: config.startTime,
        duration: config.duration,
        ...(typeof config.source === 'string' && { src: config.source }),
        ...(typeof config.content === 'string' && { content: config.content }),
      },
      target,
    );

    const elementId = asRecord(result.data)?.elementId;
    if (typeof elementId !== 'string') {
      throw new Error('AddElement completed without returning elementId');
    }
    return elementId;
  }

  async updateElement(
    target: CutTimelineDocumentTarget,
    id: string,
    updates: TimelineElementUpdate,
  ): Promise<void> {
    const calls = buildPublicUpdateCalls(id, updates);
    if (calls.length === 0) {
      return;
    }

    for (const call of calls) {
      await this.executeOrThrow(call.toolName, call.params, target);
    }
  }

  async deleteElement(target: CutTimelineDocumentTarget, id: string): Promise<void> {
    await this.executeOrThrow('DeleteElement', { elementId: id }, target);
  }

  async executeAgentTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const target = readTimelineTarget(args);
    if (!target) {
      return {
        success: false,
        error: 'Timeline tools require an explicit file .nkv documentUri.',
      };
    }
    return new TimelineToolBridge(this.runner, target).executeAgentToolForTarget(toolName, args);
  }

  private async executeAgentToolForTarget(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO:
          return await this.executeInternal('GetTimelineInfo', {});
        case TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO:
          return await this.executeInternal('GetElementInfo', {
            elementId: args.elementId,
          });
        case TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS:
          return await this.executeInternal('ListElements', {
            ...(args.trackId !== undefined && { trackId: args.trackId }),
            ...(args.type !== undefined && { type: args.type }),
          });
        case TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT:
          return await this.executeInternal('AddElement', {
            trackId: args.trackId,
            type: normalizeElementType(args.type as TimelineElementConfig['type']),
            startTime: args.startTime,
            duration: args.duration,
            ...(typeof args.source === 'string' && { src: args.source }),
            ...(typeof args.content === 'string' && { content: args.content }),
          });
        case TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT: {
          const elementId = args.id as string | undefined;
          const updates = asRecord(args.updates);
          if (!elementId || !updates) {
            return { success: false, error: 'id and updates are required' };
          }

          const calls = buildPublicUpdateCalls(elementId, updates as TimelineElementUpdate);
          let lastResult: ToolResult = { success: true };
          for (const call of calls) {
            lastResult = await this.executeInternal(call.toolName, call.params);
            if (!lastResult.success) {
              return lastResult;
            }
          }
          return lastResult;
        }
        case TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT:
          return await this.executeInternal('DeleteElement', {
            elementId: args.id,
          });
        case TOOL_NAMES_TIMELINE.TRIM_ELEMENT:
          return await this.executeInternal('TrimElement', {
            elementId: args.elementId,
            ...(args.trimStart !== undefined && { trimStart: args.trimStart }),
            ...(args.trimEnd !== undefined && { trimEnd: args.trimEnd }),
          });
        case TOOL_NAMES_TIMELINE.SPLIT_ELEMENT:
          return await this.executeInternal('SplitElement', {
            elementId: args.elementId,
            splitTime: args.splitTime,
          });
        case TOOL_NAMES_TIMELINE.LIST_EFFECTS:
          return await this.executeInternal('ListEffects', {});
        case TOOL_NAMES_TIMELINE.ADD_EFFECT:
          return await this.executeInternal('AddEffect', {
            elementId: args.elementId,
            effectType: args.effectType,
            params: asRecord(args.params) ?? asRecord(args.parameters) ?? {},
          });
        case TOOL_NAMES_TIMELINE.UPDATE_EFFECT:
          return await this.executeInternal('UpdateEffect', {
            elementId: args.elementId,
            effectId: args.effectId,
            params: asRecord(args.params) ?? {},
          });
        case TOOL_NAMES_TIMELINE.REMOVE_EFFECT:
          return await this.executeInternal('RemoveEffect', {
            elementId: args.elementId,
            effectId: args.effectId,
          });
        case TOOL_NAMES_TIMELINE.LIST_TRANSITIONS:
          return await this.executeInternal('ListTransitions', {});
        case TOOL_NAMES_TIMELINE.SET_TRANSITION:
          return await this.executeInternal('SetTransition', {
            elementId: args.elementId,
            placement: args.placement,
            type: args.type,
            duration: args.duration,
            ...(args.easing !== undefined && { easing: args.easing }),
            ...(args.params !== undefined && { params: args.params }),
          });
        case TOOL_NAMES_TIMELINE.REMOVE_TRANSITION:
          return await this.executeInternal('RemoveTransition', {
            elementId: args.elementId,
            placement: args.placement,
          });
        case TOOL_NAMES_TIMELINE.ADD_TRACK:
          return await this.executeInternal('AddTrack', {
            type: args.type,
            name:
              (args.name as string | undefined) ?? defaultTrackName(String(args.type ?? 'media')),
          });
        case TOOL_NAMES_TIMELINE.DELETE_TRACK:
          return await this.executeInternal('DeleteTrack', {
            trackId: args.trackId,
          });
        case TOOL_NAMES_TIMELINE.REORDER_TRACKS:
          return await this.executeInternal('ReorderTracks', {
            trackIds: args.trackIds,
          });
        case TOOL_NAMES_TIMELINE.SET_TRACK_PROPERTIES:
          return await this.executeInternal('SetTrackProperties', {
            trackId: args.trackId,
            ...(args.name !== undefined && { name: args.name }),
            ...(args.locked !== undefined && { locked: args.locked }),
            ...(args.muted !== undefined && { muted: args.muted }),
          });
        case TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION:
          return await this.executeInternal('SetColorCorrection', {
            elementId: args.elementId,
            ...(args.colorCorrection !== undefined && { colorCorrection: args.colorCorrection }),
            ...(args.brightness !== undefined && { brightness: args.brightness }),
            ...(args.contrast !== undefined && { contrast: args.contrast }),
            ...(args.saturation !== undefined && { saturation: args.saturation }),
            ...(args.temperature !== undefined && { temperature: args.temperature }),
            ...(args.tint !== undefined && { tint: args.tint }),
            ...(args.exposure !== undefined && { exposure: args.exposure }),
            ...(args.gamma !== undefined && { gamma: args.gamma }),
            ...(args.shadows !== undefined && { shadows: args.shadows }),
            ...(args.highlights !== undefined && { highlights: args.highlights }),
          });
        case TOOL_NAMES_TIMELINE.RESET_COLOR_CORRECTION:
          return await this.executeInternal('ResetColorCorrection', {
            elementId: args.elementId,
          });
        case TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES:
          return await this.executeInternal('SetAudioProperties', {
            elementId: args.elementId,
            ...(args.volume !== undefined && { volume: args.volume }),
            ...(args.pan !== undefined && { pan: args.pan }),
            ...(args.muted !== undefined && { muted: args.muted }),
            ...(args.fadeIn !== undefined && { fadeIn: args.fadeIn }),
            ...(args.fadeOut !== undefined && { fadeOut: args.fadeOut }),
          });
        case TOOL_NAMES_TIMELINE.SEPARATE_AUDIO:
          return await this.executeInternal('SeparateAudio', {
            elementId: args.elementId,
            ...(args.targetTrackId !== undefined && { targetTrackId: args.targetTrackId }),
          });
        case TOOL_NAMES_TIMELINE.SET_PLAYBACK_SPEED:
          return await this.executeInternal('SetPlaybackSpeed', {
            elementId: args.elementId,
            speed: args.speed,
          });
        default:
          return { success: false, error: `Unsupported timeline tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeInternal<T = unknown>(
    toolName: string,
    params: Record<string, unknown>,
    target = this.defaultTarget,
  ): Promise<ToolResult & { data?: T }> {
    if (!target) {
      return { success: false, error: 'Timeline operation has no explicit Cut target.' };
    }
    const result = await this.runner.execute(toolName, params, target);
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? `Failed to execute ${toolName}`,
      };
    }

    return {
      success: true,
      data: result.data as T | undefined,
      duration: result.duration,
      attachments: result.attachments,
    };
  }

  private async executeOrThrow<T = unknown>(
    toolName: string,
    params: Record<string, unknown>,
    target: CutTimelineDocumentTarget,
  ): Promise<ToolResult & { data?: T }> {
    const result = await this.executeInternal<T>(toolName, params, target);
    if (!result.success) {
      throw new Error(result.error ?? `Failed to execute ${toolName}`);
    }
    return result;
  }
}

function readTimelineTarget(args: Record<string, unknown>): CutTimelineDocumentTarget | undefined {
  const documentUri = args['documentUri'];
  if (typeof documentUri !== 'string' || !documentUri.trim()) return undefined;
  const expectedProjectRevision = args['expectedProjectRevision'];
  return {
    documentUri,
    ...(typeof expectedProjectRevision === 'string' && expectedProjectRevision.trim()
      ? { expectedProjectRevision }
      : {}),
  };
}
