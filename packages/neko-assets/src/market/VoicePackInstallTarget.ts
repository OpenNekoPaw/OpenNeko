import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

const MARKET_VOICE_PACK_BASE = path.join(os.homedir(), '.neko', 'presets', 'voice-pack');

export class VoicePackInstallTarget implements IInstallTarget<'media'> {
  readonly type = 'media' as const;

  constructor(private readonly baseDir: string = MARKET_VOICE_PACK_BASE) {}

  validateManifest(manifest: AssetManifest): void {
    const metadata = manifest.typeMetadata;
    if (manifest.type !== 'media' || metadata?.type !== 'media') {
      throw new Error(`VoicePackInstallTarget cannot install asset type: ${manifest.type}`);
    }
    if (metadata.data.mediaKind !== 'voice-pack') {
      throw new Error(
        `VoicePackInstallTarget cannot install media kind: ${metadata.data.mediaKind}`,
      );
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    this.validateManifest(manifest);
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(this.baseDir, publisherId, manifest.name);
  }
}
