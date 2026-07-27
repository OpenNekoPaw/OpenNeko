import { NodeMediaRuntime } from '@neko/media/node';

export interface IAgentMediaRuntimeProvider {
  getRuntime(): NodeMediaRuntime;
  transcodeFile(
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ): Promise<boolean>;
  dispose(): Promise<void>;
}

class AgentMediaRuntimeProvider implements IAgentMediaRuntimeProvider {
  private readonly runtime = new NodeMediaRuntime();

  getRuntime(): NodeMediaRuntime {
    return this.runtime;
  }

  async transcodeFile(
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ): Promise<boolean> {
    await this.runtime.transcode(inputPath, outputPath, { kind: mediaType });
    return true;
  }

  dispose(): Promise<void> {
    return this.runtime.dispose();
  }
}

let singleton: IAgentMediaRuntimeProvider | undefined;

export function getAgentMediaRuntimeProvider(): IAgentMediaRuntimeProvider {
  singleton ??= new AgentMediaRuntimeProvider();
  return singleton;
}
