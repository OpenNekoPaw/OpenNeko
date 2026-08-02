import type { ContentLocator } from '@neko/content';
import type {
  CanvasAgentTargetRef,
  StoryboardTextCue,
  StoryboardVoiceCue,
} from '@neko/canvas-domain';

export const NEKO_PLUGIN_IDS = {
  canvas: 'neko.canvas',
  cut: 'neko.cut',
} as const;

export type NekoPluginKey = keyof typeof NEKO_PLUGIN_IDS;

export type PluginTransferTarget = NekoPluginKey | 'explorer';

export type PluginTransferMediaType = 'image' | 'video' | 'audio' | 'model';

export type PluginTransferTargetMode = 'insert' | 'append' | 'replace' | 'apply' | 'create-child';

export interface NekoProjectAuthoringTarget {
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly canvasId?: string;
  readonly nodeId?: string;
  readonly trackId?: string;
  readonly clipId?: string;
}

export type PluginTransferTargetRef = CanvasAgentTargetRef &
  NekoProjectAuthoringTarget & {
    readonly plugin?: PluginTransferTarget;
    readonly expectedProjectRevision?: string;
  };

export interface PluginTransferProvenance {
  readonly source?: 'agent' | 'webview' | 'tool' | 'user' | 'plugin';
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly toolCallId?: string;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PluginTransferAssetRef {
  readonly path?: string;
  readonly contentLocator?: ContentLocator;
  readonly mediaType?: PluginTransferMediaType;
  readonly name?: string;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
}

export interface PluginTransferCutStoryboardShotBase {
  readonly id: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
  readonly label: string;
}

export type PluginTransferCutStoryboardShot =
  | (PluginTransferCutStoryboardShotBase & {
      readonly imagePath: string;
      readonly imageDataUrl?: string;
    })
  | (PluginTransferCutStoryboardShotBase & {
      readonly imagePath?: string;
      readonly imageDataUrl: string;
    });

export interface PluginTransferCutStoryboardPayload {
  readonly projectName: string;
  readonly shots: readonly PluginTransferCutStoryboardShot[];
}

export type PluginTransferPayload =
  | {
      readonly kind: 'singleAsset';
      readonly asset: PluginTransferAssetRef;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'assetBatch';
      readonly assets: readonly PluginTransferAssetRef[];
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'cutStoryboard';
      readonly storyboard: PluginTransferCutStoryboardPayload;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    };

export interface PluginTransferCanvasImportAssetPayload {
  readonly path?: string;
  readonly contentLocator?: ContentLocator;
  readonly type?: PluginTransferMediaType;
  readonly name?: string;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
}

export interface PluginTransferAuthoringPayloadBase {
  readonly target?: NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly reveal?: boolean;
  readonly provenance?: PluginTransferProvenance;
}

export interface PluginTransferCutImportGeneratedClipPayload extends PluginTransferAuthoringPayloadBase {
  readonly assetPath: string;
  readonly mediaType?: PluginTransferMediaType;
  readonly name?: string;
  readonly duration?: number;
  readonly trackIndex?: number;
}

export interface PluginTransferCutStoryboardAuthoringPayload
  extends PluginTransferCutStoryboardPayload, PluginTransferAuthoringPayloadBase {}

export interface PluginTransferCommandPlanMap {
  readonly 'neko.canvas.importAsset': PluginTransferCanvasImportAssetPayload;
}

export type PluginTransferCommand = keyof PluginTransferCommandPlanMap;

export type PluginTransferCommandPayload<Command extends PluginTransferCommand> =
  PluginTransferCommandPlanMap[Command];

export type PluginTransferCommandPlan =
  | {
      [Command in PluginTransferCommand]: {
        status: 'execute-command';
        command: Command;
        payload: PluginTransferCommandPlanMap[Command];
      };
    }[PluginTransferCommand]
  | {
      status: 'reveal-file';
      filePath: string;
    }
  | {
      status: 'unsupported';
      target: string;
      reason?: string;
    };

export interface ProjectPluginsAvailableInput {
  readonly hasPlugin: (pluginId: string) => boolean;
}
