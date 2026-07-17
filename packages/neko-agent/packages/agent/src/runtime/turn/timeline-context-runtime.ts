import type { MultimodalContextPacket } from '@neko/shared';
import {
  resolvePerceptionContextPacket,
  type PerceptionInputMaterializer,
} from '@neko/content';
import {
  createTimelineContextPacketFromEditor,
  type TimelineEditorContextInput,
} from './multimodal-context-packet';

export interface TimelineContextEditorLike {
  readonly capabilities: {
    readonly hasTimeline: boolean;
  };
  getSelection(): {
    readonly elementIds: readonly string[];
    readonly trackId?: string;
    readonly timeRange?: TimelineEditorContextInput['timeRange'];
  };
  getState(): {
    readonly currentTime?: number;
  };
  getContent<T = unknown>(): T;
}

export interface TimelineContextRuntimeOptions {
  readonly getPerceptionMaterializer?: () => Promise<PerceptionInputMaterializer | null | undefined>;
}

export interface BuildTimelineContextPacketInput {
  readonly activeEditor?: TimelineContextEditorLike;
  readonly message: string;
  readonly workspaceRoot?: string;
}

export interface TimelineContextRuntime {
  build(input: BuildTimelineContextPacketInput): Promise<MultimodalContextPacket | null>;
}

export function createTimelineContextRuntime(
  options: TimelineContextRuntimeOptions = {},
): TimelineContextRuntime {
  return new DefaultTimelineContextRuntime(options);
}

class DefaultTimelineContextRuntime implements TimelineContextRuntime {
  constructor(private readonly options: TimelineContextRuntimeOptions) {}

  async build(input: BuildTimelineContextPacketInput): Promise<MultimodalContextPacket | null> {
    const activeEditor = input.activeEditor;
    if (!activeEditor?.capabilities.hasTimeline) {
      return null;
    }

    const selection = activeEditor.getSelection();
    const state = activeEditor.getState();
    const packet = createTimelineContextPacketFromEditor({
      content: activeEditor.getContent<unknown>(),
      selectedElementIds: selection.elementIds,
      ...(selection.trackId ? { selectedTrackId: selection.trackId } : {}),
      ...(state.currentTime !== undefined ? { currentTime: state.currentTime } : {}),
      ...(selection.timeRange ? { timeRange: selection.timeRange } : {}),
      userAnnotation: input.message,
    });

    if (!packet || !this.options.getPerceptionMaterializer) {
      return packet;
    }

    const materializer = await this.options.getPerceptionMaterializer();
    if (!materializer) {
      return packet;
    }

    return resolvePerceptionContextPacket(packet, {
      materializer,
      workspaceRoot: input.workspaceRoot,
    });
  }
}
