import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_RENDER_SERVICE_PORT_ID,
  TIMELINE_RENDER_SERVICE_PORT_ID,
  TOOL_NAMES_EFFECTS,
  type Tool,
} from '@neko/shared';

const executeCommand = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({ commands: { executeCommand } }));

function toolByName(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Expected tool ${name} to be registered`);
  return tool;
}

describe('EngineCapabilityProvider media closure', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    executeCommand.mockResolvedValue('{"status":"ok","data":{"ok":true}}');
  });

  it('registers only effects and media analysis tools', async () => {
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools({ extensionContext: undefined });

    expect(tools.map(({ name }) => name)).toEqual([
      TOOL_NAMES_EFFECTS.LIST_VIDEO_EFFECTS,
      TOOL_NAMES_EFFECTS.GET_VIDEO_EFFECT_INFO,
      TOOL_NAMES_EFFECTS.REGISTER_CUSTOM_SHADER,
      'AnalyzeLoudness',
      'ExtractVideoFrame',
    ]);
    expect(toolByName(tools, 'AnalyzeLoudness').domain).toEqual({
      id: 'audio',
      source: 'engine-tool',
      servicePortId: AUDIO_RENDER_SERVICE_PORT_ID,
    });
    expect(toolByName(tools, 'ExtractVideoFrame').domain).toEqual({
      id: 'timeline',
      source: 'engine-tool',
      servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
    });
  });

  it('dispatches retained tools through retained groups', async () => {
    executeCommand
      .mockResolvedValueOnce('{"status":"ok","data":{"integratedLufs":-15}}')
      .mockResolvedValueOnce('{"status":"ok","data":{"base64":"frame"}}');
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools({ extensionContext: undefined });

    await toolByName(tools, 'AnalyzeLoudness').execute({ source: '/media/audio.wav' });
    await toolByName(tools, 'ExtractVideoFrame').execute({
      source: '/media/video.mp4',
      time: 1.5,
    });

    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      'neko.engine.dispatch',
      'audios',
      'analyze_loudness',
      { source: '/media/audio.wav', targetLufs: -14 },
    );
    expect(executeCommand).toHaveBeenNthCalledWith(
      2,
      'neko.engine.dispatch',
      'videos',
      'capture',
      { source: '/media/video.mp4', time: 1.5, format: 'jpeg', quality: 85 },
    );
  });
});
