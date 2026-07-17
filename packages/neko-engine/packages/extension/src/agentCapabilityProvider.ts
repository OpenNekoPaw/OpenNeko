/** Agent-facing tools backed only by retained media engine groups. */

import * as vscode from 'vscode';
import {
  AUDIO_RENDER_SERVICE_PORT_ID,
  TIMELINE_RENDER_SERVICE_PORT_ID,
  TOOL_NAMES_EFFECTS,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type CreativeDomainMetadata,
  type Tool,
  type ToolResult,
} from '@neko/shared';

interface ActionResponse<T = unknown> {
  readonly status: 'ok' | 'error';
  readonly data?: T;
  readonly error?: { readonly message?: string };
  readonly message?: string;
}

interface ShaderParamDef {
  readonly name: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

interface EffectPresetInfo {
  readonly id: string;
  readonly description: string;
  readonly params: readonly ShaderParamDef[];
}

interface FrameCaptureResponse {
  readonly data?: string;
  readonly base64?: string;
}

const MEDIA_DOMAIN: CreativeDomainMetadata = {
  id: 'timeline',
  source: 'engine-tool',
  servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
};

const AUDIO_DOMAIN: CreativeDomainMetadata = {
  id: 'audio',
  source: 'engine-tool',
  servicePortId: AUDIO_RENDER_SERVICE_PORT_ID,
};

async function dispatchEngine<T>(
  group: string,
  action: string,
  options: Record<string, unknown>,
): Promise<T> {
  const resultJson = await vscode.commands.executeCommand<string | null>(
    'neko.engine.dispatch',
    group,
    action,
    options,
  );
  if (!resultJson) {
    throw new Error(`Engine dispatch returned no response for ${group}:${action}`);
  }
  const response = JSON.parse(resultJson) as ActionResponse<T>;
  if (response.status === 'error') {
    throw new Error(response.error?.message ?? response.message ?? `${group}:${action} failed`);
  }
  return response.data as T;
}

function createEffectsTools(): Tool[] {
  return [
    {
      name: TOOL_NAMES_EFFECTS.LIST_VIDEO_EFFECTS,
      description: 'List available GPU video effects and their tunable parameters.',
      parameters: { type: 'object', properties: {} },
      category: 'media',
      domain: MEDIA_DOMAIN,
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(): Promise<ToolResult> {
        const data = await dispatchEngine<EffectPresetInfo[]>('effects', 'list', {});
        return { success: true, data };
      },
    },
    {
      name: TOOL_NAMES_EFFECTS.GET_VIDEO_EFFECT_INFO,
      description: 'Get metadata and parameters for one GPU video effect.',
      parameters: {
        type: 'object',
        properties: { shaderId: { type: 'string', description: 'Effect preset id' } },
        required: ['shaderId'],
      },
      category: 'media',
      domain: MEDIA_DOMAIN,
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const data = await dispatchEngine<EffectPresetInfo>('effects', 'info', {
          shaderId: requiredString(args, 'shaderId'),
        });
        return { success: true, data };
      },
    },
    {
      name: TOOL_NAMES_EFFECTS.REGISTER_CUSTOM_SHADER,
      description: 'Register a user WGSL compute shader as a GPU video effect.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          params: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                default: { type: 'number' },
                min: { type: 'number' },
                max: { type: 'number' },
              },
              required: ['name', 'default', 'min', 'max'],
            },
          },
        },
        required: ['id', 'code'],
      },
      category: 'media',
      domain: MEDIA_DOMAIN,
      isReadOnly: false,
      isConcurrencySafe: false,
      async execute(args): Promise<ToolResult> {
        const id = requiredString(args, 'id');
        await dispatchEngine('effects', 'register', {
          id,
          code: requiredString(args, 'code'),
          params: Array.isArray(args['params']) ? args['params'] : [],
        });
        return { success: true, data: { shaderId: id } };
      },
    },
  ];
}

function createAnalysisTools(): Tool[] {
  return [
    {
      name: 'AnalyzeLoudness',
      description: 'Analyze audio loudness and recommended gain for a target LUFS.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Absolute audio or video path' },
          targetLufs: { type: 'number', description: 'Target loudness; defaults to -14' },
        },
        required: ['source'],
      },
      category: 'analysis',
      domain: AUDIO_DOMAIN,
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const targetLufs = args['targetLufs'];
        const data = await dispatchEngine('audios', 'analyze_loudness', {
          source: requiredString(args, 'source'),
          targetLufs: typeof targetLufs === 'number' ? targetLufs : -14,
        });
        return { success: true, data };
      },
    },
    {
      name: 'ExtractVideoFrame',
      description: 'Extract a JPEG frame from a video at a specified time.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Absolute video path' },
          time: { type: 'number', description: 'Time in seconds' },
          width: { type: 'number' },
          height: { type: 'number' },
          quality: { type: 'number' },
        },
        required: ['source', 'time'],
      },
      category: 'analysis',
      domain: MEDIA_DOMAIN,
      isReadOnly: true,
      isConcurrencySafe: true,
      async execute(args): Promise<ToolResult> {
        const source = requiredString(args, 'source');
        const time = requiredNumber(args, 'time');
        const data = await dispatchEngine<FrameCaptureResponse>('videos', 'capture', {
          source,
          time,
          format: 'jpeg',
          quality: optionalNumber(args['quality']) ?? 85,
          ...(optionalNumber(args['width']) !== undefined && {
            width: optionalNumber(args['width']),
          }),
          ...(optionalNumber(args['height']) !== undefined && {
            height: optionalNumber(args['height']),
          }),
        });
        const base64 = data.data ?? data.base64;
        if (!base64) {
          return { success: false, error: `Failed to extract frame from ${source} at ${time}s` };
        }
        return { success: true, data: { base64, mimeType: 'image/jpeg', source, time } };
      },
    },
  ];
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function requiredNumber(args: Record<string, unknown>, key: string): number {
  const value = optionalNumber(args[key]);
  if (value === undefined) throw new Error(`${key} must be a finite number`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

class EngineCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-engine';
  readonly version = '1.0.0';

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [...createEffectsTools(), ...createAnalysisTools()];
  }

  dispose(): void {}
}

export function createEngineCapabilityProvider(): AgentCapabilityProvider {
  return new EngineCapabilityProvider();
}
