import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client/EngineClient';
import { resolveNekoExtension } from '@neko/shared/vscode/extension';
import type { IEngineRuntimeResolver } from '../contracts/IEngineRuntimeResolver';
import { getLogger } from '../utils/logger';

const logger = getLogger('EngineRuntimeResolver');
const ENGINE_EXTENSION_ID = 'neko.neko-engine';

export class VSCodeEngineRuntimeResolver implements IEngineRuntimeResolver {
  private client: EngineClient | null = null;
  private initPromise: Promise<EngineClient | null> | null = null;

  async ensureClient(): Promise<EngineClient | null> {
    if (this.client) {
      return this.client;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeClient();
    const client = await this.initPromise;
    this.initPromise = null;
    return client;
  }

  private async initializeClient(): Promise<EngineClient | null> {
    const ext = resolveNekoExtension(ENGINE_EXTENSION_ID, (id) =>
      vscode.extensions.getExtension(id),
    );
    if (!ext) {
      logger.error(`OpenNeko feature ${ENGINE_EXTENSION_ID} is unavailable`);
      return null;
    }

    if (!ext.isActive) {
      try {
        await ext.activate();
      } catch (error) {
        logger.error(`Failed to activate ${ENGINE_EXTENSION_ID}:`, error);
        return null;
      }
    }

    try {
      const result = await vscode.commands.executeCommand<{ port: number } | null>(
        'neko.engine.ensureFrameServer',
      );
      if (!result) {
        logger.error('ensureFrameServer returned null');
        return null;
      }

      this.client = new EngineClient(result.port);
      return this.client;
    } catch (error) {
      logger.error('Failed to start frame server:', error);
      return null;
    }
  }
}
