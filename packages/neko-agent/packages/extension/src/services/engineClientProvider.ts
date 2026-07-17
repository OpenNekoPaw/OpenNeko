/**
 * neko-engine host adapter.
 *
 * Extension code owns VSCode activation and command execution. Agent/runtime
 * code receives a stable capability surface and does not need to know how the
 * engine extension is discovered.
 */

import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client/EngineClient';
import {
  NEKO_ENGINE_CLIENT_TIMEOUT_MS,
  NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND,
  NEKO_ENGINE_EXTENSION_ID,
  isNekoEngineFrameServerResult,
} from '@neko-agent/types';
import { getLogger } from '../base';

const logger = getLogger('EngineClientProvider');

export interface IEngineClientProvider {
  getOptionalClient(): Promise<EngineClient | null>;
  getRequiredClient(): Promise<EngineClient>;
  setAuthorizedReadRoots?(roots: readonly string[]): Promise<void>;
  transcodeFile(
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ): Promise<boolean>;
}

class VSCodeEngineClientProvider implements IEngineClientProvider {
  private _engineClient?: EngineClient;
  private authorizedReadRoots: readonly string[] = [];
  private configuredReadRootsKey = '';

  async getOptionalClient(): Promise<EngineClient | null> {
    try {
      return await this.getRequiredClient();
    } catch {
      return null;
    }
  }

  async getRequiredClient(): Promise<EngineClient> {
    if (this._engineClient) {
      return this._engineClient;
    }

    const extension = vscode.extensions.getExtension(NEKO_ENGINE_EXTENSION_ID);
    if (!extension) {
      throw new Error(`Extension ${NEKO_ENGINE_EXTENSION_ID} not installed`);
    }

    if (!extension.isActive) {
      await extension.activate();
    }

    const result = await vscode.commands.executeCommand<unknown>(
      NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND,
      this.authorizedReadRoots,
    );
    if (!isNekoEngineFrameServerResult(result)) {
      throw new Error('Failed to start neko-engine Frame Server');
    }

    this._engineClient = new EngineClient(result.port, { timeout: NEKO_ENGINE_CLIENT_TIMEOUT_MS });
    this.configuredReadRootsKey = createReadRootsKey(this.authorizedReadRoots);
    return this._engineClient;
  }

  async setAuthorizedReadRoots(roots: readonly string[]): Promise<void> {
    this.authorizedReadRoots = dedupePaths(roots);
    const rootsKey = createReadRootsKey(this.authorizedReadRoots);
    if (!this._engineClient || rootsKey === this.configuredReadRootsKey) {
      return;
    }
    await vscode.commands.executeCommand<unknown>(
      NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND,
      this.authorizedReadRoots,
    );
    this.configuredReadRootsKey = rootsKey;
  }

  async transcodeFile(
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ): Promise<boolean> {
    const client = await this.getOptionalClient();
    if (!client) return false;

    try {
      const group = mediaType === 'audio' ? 'audios' : 'videos';
      const codec = mediaType === 'audio' ? 'mp3' : 'h264';
      const response = await client.dispatch({
        group,
        action: 'transcode',
        options: { source: inputPath, output: outputPath, codec },
      });
      return response.status === 'ok';
    } catch (error) {
      logger.warn('neko-engine transcode failed:', error);
      return false;
    }
  }

}

let singleton: IEngineClientProvider | undefined;

export function getEngineClientProvider(): IEngineClientProvider {
  singleton ??= new VSCodeEngineClientProvider();
  return singleton;
}

function createReadRootsKey(roots: readonly string[]): string {
  return JSON.stringify(dedupePaths(roots));
}

function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}
